import type { InboundInboxEvent, PostMetrics, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  PublishRequest,
  PublishResult,
  SendMessageResult,
  SocialConnectorAdapter,
} from '../interfaces'
import { assertTrustedPublishMediaUrl } from '@/lib/security/trusted-publish-media-url'

// Instagram via the Meta Graph API. Publishing requires an Instagram
// Business or Creator account linked to a Facebook Page — there is no
// direct Instagram-only OAuth for posting.
// https://developers.facebook.com/docs/instagram-platform/content-publishing

const GRAPH_VERSION = 'v21.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`
const AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth'
const SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management']
const GRAPH_REQUEST_TIMEOUT_MS = 30_000

// Instagram enforces a rolling publish quota per account surfaced via this
// endpoint. We read the provider's current quota rather than hard-coding one.
const PUBLISHING_LIMIT_FIELDS = 'config,quota_usage'

// Reels/video containers are processed asynchronously. Meta's publishing flow
// requires waiting until status_code=FINISHED before media_publish. Keep the
// polling bounded so a serverless invocation cannot wait indefinitely.
const REEL_STATUS_POLL_ATTEMPTS = 15
const REEL_STATUS_POLL_INTERVAL_MS = 2_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function isInstagramConfigured(): boolean {
  return Boolean(process.env.META_APP_ID?.trim())
}

export function buildInstagramAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('META_APP_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(','),
    response_type: 'code',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${GRAPH_URL}${path}?${new URLSearchParams(params).toString()}`
  const response = await graphFetch(url)
  return response as T
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${GRAPH_URL}${path}`
  const response = await graphFetch(url, { method: 'POST', body: new URLSearchParams(params) })
  return response as T
}

async function graphFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (payload as { error?: { message?: string; code?: number } } | null)?.error?.message
    throw new Error(`Instagram Graph API error (${response.status}): ${message ?? 'unknown error'}`)
  }

  return payload
}

/**
 * media_publish is the irreversible public side effect. A network exception,
 * 5xx, unreadable success body, or success body without an id cannot prove the
 * post was rejected; classify those as EXTERNAL_RESULT_UNKNOWN so callers block
 * automatic/manual retry instead of potentially publishing the same media twice.
 */
async function publishInstagramContainer(
  igUserId: string,
  creationId: string,
  accessToken: string,
): Promise<{ id: string }> {
  let response: Response
  try {
    response = await fetch(`${GRAPH_URL}/${igUserId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ access_token: accessToken, creation_id: creationId }),
      signal: AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'network error'
    throw new Error(
      `EXTERNAL_RESULT_UNKNOWN: Instagram media_publish lost its response (${detail}). The post may already be live, so automatic retry is blocked.`,
    )
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message ?? 'unknown error'
    if (response.status >= 500) {
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: Instagram media_publish returned ${response.status} after the publish request. Delivery cannot be proven either way, so automatic retry is blocked. Detail: ${message}`,
      )
    }
    throw new Error(`Instagram Graph API error (${response.status}): ${message}`)
  }

  const id = (payload as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !id) {
    throw new Error(
      'EXTERNAL_RESULT_UNKNOWN: Instagram media_publish returned success without a post id. The post may already be live, so automatic retry is blocked.',
    )
  }

  return { id }
}

async function waitForReelContainerReady(containerId: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < REEL_STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await graphGet<{ status_code?: string; status?: string }>(`/${containerId}`, {
      fields: 'status_code,status',
      access_token: accessToken,
    })

    if (status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') return
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram Reel container ${status.status_code.toLowerCase()}: ${status.status ?? 'no detail returned'}`)
    }

    if (attempt < REEL_STATUS_POLL_ATTEMPTS - 1) {
      await sleep(REEL_STATUS_POLL_INTERVAL_MS)
    }
  }

  throw new Error(
    `Instagram Reel is still processing after ${(REEL_STATUS_POLL_ATTEMPTS * REEL_STATUS_POLL_INTERVAL_MS) / 1000}s. Retry later; no post has been published yet.`,
  )
}

interface ShortLivedTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface LongLivedTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface PagesResponse {
  data: Array<{ id: string; access_token: string; instagram_business_account?: { id: string } }>
}

interface IgAccountResponse {
  id: string
  username: string
}

async function resolveLinkedInstagramAccount(userAccessToken: string): Promise<{
  pageAccessToken: string
  igUserId: string
  igUsername: string
}> {
  const pages = await graphGet<PagesResponse>('/me/accounts', { access_token: userAccessToken })
  const linkedPage = pages.data.find((page) => page.instagram_business_account)

  if (!linkedPage?.instagram_business_account) {
    throw new Error(
      'No Instagram Business or Creator account is linked to a Facebook Page for this login. Link one in Meta Business Suite first.',
    )
  }

  const igAccount = await graphGet<IgAccountResponse>(`/${linkedPage.instagram_business_account.id}`, {
    fields: 'username',
    access_token: linkedPage.access_token,
  })

  return { pageAccessToken: linkedPage.access_token, igUserId: igAccount.id, igUsername: igAccount.username }
}

export class InstagramConnectorAdapter implements SocialConnectorAdapter {
  async connect(_platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount> {
    const clientId = requireEnv('META_APP_ID')
    const clientSecret = requireEnv('META_APP_SECRET')

    const shortLived = await graphGet<ShortLivedTokenResponse>('/oauth/access_token', {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: options.redirectUri,
      code: authCode,
    })

    const longLived = await graphGet<LongLivedTokenResponse>('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortLived.access_token,
    })

    const { pageAccessToken, igUserId, igUsername } = await resolveLinkedInstagramAccount(longLived.access_token)

    // Store the Page access token, not the user long-lived token. Page tokens
    // do not inherit the user token's ~60-day expiry; inventing one would make
    // resolveCredentials call refreshAccessToken() and falsely fail auth after
    // that window. Mirror LINE: omit expiresAt so the stored token is used
    // until Meta rejects it or the creator reconnects.
    return {
      accessToken: pageAccessToken,
      expiresAt: undefined,
      scopes: SCOPES,
      externalAccountId: igUserId,
      handle: igUsername,
    }
  }

  async disconnect(): Promise<void> {
    // No explicit revocation call: removing the stored credentials (done by
    // the caller) is sufficient. The page access token simply stops being used.
  }

  async refreshAccessToken(): Promise<ConnectedAccount> {
    throw new Error('Instagram tokens cannot be silently refreshed. Reconnect the account from Settings.')
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const igUserId = request.externalAccountId
    if (!igUserId) {
      throw new Error('Instagram publish request is missing the connected account id.')
    }

    const mediaUrl = request.metadata.mediaUrl
    if (typeof mediaUrl !== 'string' || !mediaUrl) {
      throw new Error('Instagram requires a media URL. Attach an image or video to this Seed (or set mediaUrl on the Revision) before scheduling.')
    }
    const trustedMediaUrl = assertTrustedPublishMediaUrl(mediaUrl).toString()

    await this.assertWithinPublishingLimit(igUserId, request.accessToken)

    const caption = buildCaption(request)
    const isVideo = request.metadata.mediaType === 'video' || request.metadata.mediaType === 'reel'
    const coverUrl = typeof request.metadata.coverUrl === 'string' ? request.metadata.coverUrl : undefined
    const trustedCoverUrl = coverUrl ? assertTrustedPublishMediaUrl(coverUrl).toString() : undefined

    if (trustedCoverUrl && !isVideo) {
      throw new Error('Instagram cover images apply to Reels only. This job is an image post, so remove the cover or attach a 9:16 video.')
    }

    const creation = await graphPost<{ id: string }>(`/${igUserId}/media`, {
      access_token: request.accessToken,
      caption,
      ...(isVideo
        ? {
            video_url: trustedMediaUrl,
            media_type: 'REELS',
            ...(trustedCoverUrl ? { cover_url: trustedCoverUrl } : {}),
          }
        : { image_url: trustedMediaUrl }),
    })

    if (isVideo) {
      await waitForReelContainerReady(creation.id, request.accessToken)
    }

    const published = await publishInstagramContainer(igUserId, creation.id, request.accessToken)

    // media_publish is the irreversible side effect. A later permalink lookup
    // is only enrichment; if it fails, the post still exists. Never throw here
    // and turn a confirmed real publish into a retryable failed job.
    let externalUrl: string | undefined
    try {
      const permalink = await graphGet<{ permalink?: string }>(`/${published.id}`, {
        fields: 'permalink',
        access_token: request.accessToken,
      })
      externalUrl = permalink.permalink
    } catch (cause) {
      console.warn(`Instagram post ${published.id} published, but permalink lookup failed:`, cause)
    }

    return { externalPostId: published.id, externalUrl }
  }

  private async assertWithinPublishingLimit(igUserId: string, accessToken: string): Promise<void> {
    const limit = await graphGet<{ data: Array<{ quota_usage: number; config: { quota_total: number } }> }>(
      `/${igUserId}/content_publishing_limit`,
      { fields: PUBLISHING_LIMIT_FIELDS, access_token: accessToken },
    )

    const usage = limit.data[0]
    if (!usage || typeof usage.quota_usage !== 'number' || typeof usage.config?.quota_total !== 'number') {
      throw new Error(
        'Instagram publishing quota could not be verified (empty or malformed content_publishing_limit response). Refusing to publish until Meta returns a usable quota row.',
      )
    }
    if (usage.quota_usage >= usage.config.quota_total) {
      throw new Error(`Instagram publishing limit reached (${usage.quota_usage}/${usage.config.quota_total} in 24h).`)
    }
  }

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error('Instagram DMの送信はMessaging権限（pages_messaging等）とMeta App Reviewが必要なため未対応です。Phase 1は受信のみ対応です。')
  }

  async fetchInbox(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram inbox items arrive via webhook push (see /api/webhooks/meta) — no pull/backfill endpoint is implemented.')
  }

  async fetchComments(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram comments arrive via webhook push (see /api/webhooks/meta) — no pull/backfill endpoint is implemented.')
  }

  async fetchMentions(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram mention sync is not available: resolving a mention webhook to its comment text requires an extra Graph API call not yet implemented.')
  }

  async fetchMessages(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram DMs arrive via webhook push (see /api/webhooks/meta) — no pull/backfill endpoint is implemented.')
  }

  async fetchMetrics(): Promise<PostMetrics> {
    throw new Error('Instagram metrics are not available: reading Insights requires the instagram_manage_insights scope, which this app does not yet request.')
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://instagram.com/${handle.replace('@', '')}`
  }
}

function buildCaption(request: PublishRequest): string {
  const hashtagSuffix = request.hashtags.length > 0 ? `\n\n${request.hashtags.map((tag) => `#${tag}`).join(' ')}` : ''
  const ctaSuffix = request.cta ? `\n\n${request.cta}` : ''
  return `${request.body}${ctaSuffix}${hashtagSuffix}`.trim()
}
