import type { InboundInboxEvent, PostMetrics, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  PublishRequest,
  PublishResult,
  SocialConnectorAdapter,
} from '../interfaces'

// Instagram via the Meta Graph API. Publishing requires an Instagram
// Business or Creator account linked to a Facebook Page — there is no
// direct Instagram-only OAuth for posting.
// https://developers.facebook.com/docs/instagram-platform/content-publishing

const GRAPH_VERSION = 'v21.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`
const AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth'
const SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management']

// Instagram enforces a rolling publish quota per account (25/day at the
// time of writing) surfaced via this endpoint — see content_publishing_limit
// in docs/master-plan.md §3. We only read it to fail with a clear reason,
// never to silently drop a scheduled job.
const PUBLISHING_LIMIT_FIELDS = 'config,quota_usage'

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
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (payload as { error?: { message?: string; code?: number } } | null)?.error?.message
    throw new Error(`Instagram Graph API error (${response.status}): ${message ?? 'unknown error'}`)
  }

  return payload
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

    return {
      // The page access token is what actually publishes to the linked IG
      // account, so that — not the short-lived user token — is what we keep.
      accessToken: pageAccessToken,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
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
    // Meta long-lived Page access tokens do not expire as long as the
    // linked user token stays valid, and Meta has no refresh_token grant —
    // re-connecting (a fresh OAuth round trip) is the only renewal path.
    throw new Error('Instagram tokens cannot be silently refreshed. Reconnect the account from Settings.')
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const igUserId = request.externalAccountId
    if (!igUserId) {
      throw new Error('Instagram publish request is missing the connected account id.')
    }

    const mediaUrl = request.metadata.mediaUrl
    if (typeof mediaUrl !== 'string' || !mediaUrl) {
      // Honest gap: no PR has built Seed-asset-to-Revision media attachment
      // yet (drafts/Revisions are text-only through PR3). Fail closed with a
      // clear reason rather than attempting a request Instagram will reject.
      throw new Error('Instagram requires a media URL. Attach one to this draft before scheduling (not yet built).')
    }

    await this.assertWithinPublishingLimit(igUserId, request.accessToken)

    const caption = buildCaption(request)
    const isVideo = request.metadata.mediaType === 'video' || request.metadata.mediaType === 'reel'

    const creation = await graphPost<{ id: string }>(`/${igUserId}/media`, {
      access_token: request.accessToken,
      caption,
      ...(isVideo
        ? { video_url: mediaUrl, media_type: 'REELS' }
        : { image_url: mediaUrl }),
    })

    const published = await graphPost<{ id: string }>(`/${igUserId}/media_publish`, {
      access_token: request.accessToken,
      creation_id: creation.id,
    })

    const permalink = await graphGet<{ permalink?: string }>(`/${published.id}`, {
      fields: 'permalink',
      access_token: request.accessToken,
    })

    return { externalPostId: published.id, externalUrl: permalink.permalink }
  }

  private async assertWithinPublishingLimit(igUserId: string, accessToken: string): Promise<void> {
    const limit = await graphGet<{ data: Array<{ quota_usage: number; config: { quota_total: number } }> }>(
      `/${igUserId}/content_publishing_limit`,
      { fields: PUBLISHING_LIMIT_FIELDS, access_token: accessToken },
    )

    const usage = limit.data[0]
    if (usage && usage.quota_usage >= usage.config.quota_total) {
      throw new Error(`Instagram publishing limit reached (${usage.quota_usage}/${usage.config.quota_total} in 24h).`)
    }
  }

  // Comments and DMs arrive via webhook push (see src/app/api/webhooks/meta),
  // not a pull sync — there is no on-demand backfill endpoint implemented in
  // this app, so these methods exist to fail closed rather than silently
  // return nothing.
  async fetchInbox(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram inbox items arrive via webhook push (see /api/webhooks/meta) — no pull/backfill endpoint is implemented.')
  }

  async fetchComments(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram comments arrive via webhook push (see /api/webhooks/meta) — no pull/backfill endpoint is implemented.')
  }

  async fetchMentions(): Promise<InboundInboxEvent[]> {
    // A documented, honest gap: Meta's `mentions` webhook field only carries
    // a media_id/comment_id pointer, not the comment text itself — resolving
    // it needs an extra authenticated Graph API call this app does not make.
    throw new Error('Instagram mention sync is not available: resolving a mention webhook to its comment text requires an extra Graph API call not yet implemented.')
  }

  async fetchMessages(): Promise<InboundInboxEvent[]> {
    throw new Error('Instagram DMs arrive via webhook push (see /api/webhooks/meta) — no pull/backfill endpoint is implemented.')
  }

  async fetchMetrics(): Promise<PostMetrics> {
    // Honest gap: Meta's media Insights API (impressions/reach/likes/comments)
    // needs the instagram_manage_insights scope, which this app does not
    // currently request (see SCOPES above) — adding it means every account
    // must reconnect, and depending on Meta's current API version may also
    // need Advanced Access review. Not attempted speculatively.
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
