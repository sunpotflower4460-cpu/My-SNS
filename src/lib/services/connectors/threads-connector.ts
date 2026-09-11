import type { InboundInboxEvent, PostMetrics, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  PublishRequest,
  PublishResult,
  RefreshedCredentials,
  SendMessageResult,
  SocialConnectorAdapter,
} from '../interfaces'
import { assertTrustedPublishMediaUrl } from '@/lib/security/trusted-publish-media-url'

// Threads (Meta) via its own dedicated API — a separate OAuth app from the
// Facebook Graph login Instagram uses (own client id/secret, own authorize
// host). A connecting user's Threads account IS the publishing account, so
// unlike Instagram there is no linked-Page resolution step.
// https://developers.facebook.com/docs/threads

const THREADS_API_VERSION = 'v1.0'
const THREADS_GRAPH_URL = `https://graph.threads.net/${THREADS_API_VERSION}`
const THREADS_AUTHORIZE_URL = 'https://threads.net/oauth/authorize'
const THREADS_TOKEN_URL = 'https://graph.threads.net/oauth/access_token'
const THREADS_LONG_LIVED_TOKEN_URL = `https://graph.threads.net/${THREADS_API_VERSION}/access_token`
const THREADS_REFRESH_URL = `https://graph.threads.net/${THREADS_API_VERSION}/refresh_access_token`
const SCOPES = ['threads_basic', 'threads_content_publish']
const REQUEST_TIMEOUT_MS = 30_000

// Video containers are processed asynchronously, same shape as Instagram Reels.
const VIDEO_STATUS_POLL_ATTEMPTS = 15
const VIDEO_STATUS_POLL_INTERVAL_MS = 2_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function isThreadsConfigured(): boolean {
  return Boolean(process.env.THREADS_CLIENT_ID?.trim())
}

export function buildThreadsAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('THREADS_CLIENT_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(','),
    response_type: 'code',
  })
  return `${THREADS_AUTHORIZE_URL}?${params.toString()}`
}

async function threadsFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message
    throw new Error(`Threads API error (${response.status}): ${message ?? 'unknown error'}`)
  }

  return payload
}

async function threadsGet<T>(url: string, params: Record<string, string>): Promise<T> {
  return threadsFetch(`${url}?${new URLSearchParams(params).toString()}`) as Promise<T>
}

async function threadsPost<T>(path: string, params: Record<string, string>): Promise<T> {
  return threadsFetch(`${THREADS_GRAPH_URL}${path}`, { method: 'POST', body: new URLSearchParams(params) }) as Promise<T>
}

/**
 * threads_publish is the irreversible public side effect. A network
 * exception, 5xx, unreadable success body, or success body without an id
 * cannot prove the post was rejected; classify those as EXTERNAL_RESULT_UNKNOWN
 * so callers block automatic/manual retry instead of potentially posting twice.
 */
async function publishThreadsContainer(threadsUserId: string, creationId: string, accessToken: string): Promise<{ id: string }> {
  let response: Response
  try {
    response = await fetch(`${THREADS_GRAPH_URL}/${threadsUserId}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({ access_token: accessToken, creation_id: creationId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'network error'
    throw new Error(
      `EXTERNAL_RESULT_UNKNOWN: Threads threads_publish lost its response (${detail}). The post may already be live, so automatic retry is blocked.`,
    )
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message ?? 'unknown error'
    if (response.status >= 500) {
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: Threads threads_publish returned ${response.status} after the publish request. Delivery cannot be proven either way, so automatic retry is blocked. Detail: ${message}`,
      )
    }
    throw new Error(`Threads API error (${response.status}): ${message}`)
  }

  const id = (payload as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !id) {
    throw new Error(
      'EXTERNAL_RESULT_UNKNOWN: Threads threads_publish returned success without a post id. The post may already be live, so automatic retry is blocked.',
    )
  }

  return { id }
}

async function waitForThreadsContainerReady(containerId: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < VIDEO_STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await threadsGet<{ status?: string; error_message?: string }>(`${THREADS_GRAPH_URL}/${containerId}`, {
      fields: 'status,error_message',
      access_token: accessToken,
    })

    if (status.status === 'FINISHED') return
    if (status.status === 'ERROR' || status.status === 'EXPIRED') {
      throw new Error(`Threads media container ${status.status.toLowerCase()}: ${status.error_message ?? 'no detail returned'}`)
    }

    if (attempt < VIDEO_STATUS_POLL_ATTEMPTS - 1) {
      await sleep(VIDEO_STATUS_POLL_INTERVAL_MS)
    }
  }

  throw new Error(
    `Threads media is still processing after ${(VIDEO_STATUS_POLL_ATTEMPTS * VIDEO_STATUS_POLL_INTERVAL_MS) / 1000}s. Retry later; no post has been published yet.`,
  )
}

interface ShortLivedTokenResponse {
  access_token: string
  user_id: string
}

interface LongLivedTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface ProfileResponse {
  id: string
  username: string
}

export class ThreadsConnectorAdapter implements SocialConnectorAdapter {
  async connect(_platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount> {
    const clientId = requireEnv('THREADS_CLIENT_ID')
    const clientSecret = requireEnv('THREADS_CLIENT_SECRET')

    const shortLived = await threadsFetch(THREADS_TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: options.redirectUri,
        code: authCode,
      }),
    }) as ShortLivedTokenResponse

    // Exchange for a long-lived token (~60 days) immediately, same reasoning
    // as Instagram's fb_exchange_token step — never store the short-lived one.
    const longLived = await threadsGet<LongLivedTokenResponse>(THREADS_LONG_LIVED_TOKEN_URL, {
      grant_type: 'th_exchange_token',
      client_secret: clientSecret,
      access_token: shortLived.access_token,
    })

    const profile = await threadsGet<ProfileResponse>(`${THREADS_GRAPH_URL}/me`, {
      fields: 'id,username',
      access_token: longLived.access_token,
    })

    return {
      // Threads has no separate refresh token: the long-lived access token
      // itself is what gets exchanged for a fresh one (see refreshAccessToken
      // below). Storing it here too is what makes resolveCredentials()'s
      // "no refresh token → reconnect" fallback not apply to Threads.
      accessToken: longLived.access_token,
      refreshToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
      scopes: SCOPES,
      externalAccountId: profile.id,
      handle: profile.username,
    }
  }

  async disconnect(): Promise<void> {
    // No explicit revocation call: removing the stored credentials (done by
    // the caller) is sufficient — the token simply stops being used.
  }

  /**
   * Threads has no separate refresh token — the long-lived access token
   * itself is exchanged for a fresh ~60-day token. `refreshToken` is unused
   * (the interface is shared with providers that do have one).
   */
  async refreshAccessToken(_platform: SocialPlatform, refreshToken: string): Promise<RefreshedCredentials> {
    const refreshed = await threadsGet<LongLivedTokenResponse>(THREADS_REFRESH_URL, {
      grant_type: 'th_refresh_token',
      access_token: refreshToken,
    })

    return {
      accessToken: refreshed.access_token,
      // Same self-referential shape as connect(): the freshly refreshed token
      // becomes the input for the *next* refresh cycle.
      refreshToken: refreshed.access_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      scopes: SCOPES,
    }
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const threadsUserId = request.externalAccountId
    if (!threadsUserId) {
      throw new Error('Threads publish request is missing the connected account id.')
    }

    const text = buildText(request)
    const mediaUrl = request.metadata.mediaUrl
    const isVideo = request.metadata.mediaType === 'video'

    const creationParams: Record<string, string> = { access_token: request.accessToken, text }
    if (typeof mediaUrl === 'string' && mediaUrl) {
      const trustedMediaUrl = assertTrustedPublishMediaUrl(mediaUrl).toString()
      if (isVideo) {
        creationParams.media_type = 'VIDEO'
        creationParams.video_url = trustedMediaUrl
      } else {
        creationParams.media_type = 'IMAGE'
        creationParams.image_url = trustedMediaUrl
      }
    } else {
      // Threads, unlike Instagram, allows text-only posts.
      creationParams.media_type = 'TEXT'
    }

    const creation = await threadsPost<{ id: string }>(`/${threadsUserId}/threads`, creationParams)

    if (creationParams.media_type === 'VIDEO') {
      await waitForThreadsContainerReady(creation.id, request.accessToken)
    }

    const published = await publishThreadsContainer(threadsUserId, creation.id, request.accessToken)

    // threads_publish is the irreversible side effect. A later permalink
    // lookup is only enrichment; if it fails, the post still exists. Never
    // throw here and turn a confirmed real publish into a retryable failed job.
    let externalUrl: string | undefined
    try {
      const permalink = await threadsGet<{ permalink?: string }>(`${THREADS_GRAPH_URL}/${published.id}`, {
        fields: 'permalink',
        access_token: request.accessToken,
      })
      externalUrl = permalink.permalink
    } catch (cause) {
      console.warn(`Threads post ${published.id} published, but permalink lookup failed:`, cause)
    }

    return { externalPostId: published.id, externalUrl }
  }

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error('Threads返信・DMの送信は未対応です（今回のスコープは同時投稿のみ）。')
  }

  async fetchInbox(): Promise<InboundInboxEvent[]> {
    throw new Error('Threadsの受信箱統合は未対応です（今回のスコープは同時投稿のみ）。')
  }

  async fetchComments(): Promise<InboundInboxEvent[]> {
    throw new Error('Threadsの受信箱統合は未対応です（今回のスコープは同時投稿のみ）。')
  }

  async fetchMentions(): Promise<InboundInboxEvent[]> {
    throw new Error('Threadsの受信箱統合は未対応です（今回のスコープは同時投稿のみ）。')
  }

  async fetchMessages(): Promise<InboundInboxEvent[]> {
    throw new Error('Threadsの受信箱統合は未対応です（今回のスコープは同時投稿のみ）。')
  }

  async fetchMetrics(): Promise<PostMetrics> {
    throw new Error('Threadsの投稿指標取得は未対応です（今回のスコープは同時投稿のみ）。')
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://www.threads.net/@${handle.replace('@', '')}`
  }
}

function buildText(request: PublishRequest): string {
  const hashtagSuffix = request.hashtags.length > 0 ? `\n\n${request.hashtags.map((tag) => `#${tag}`).join(' ')}` : ''
  const ctaSuffix = request.cta ? `\n\n${request.cta}` : ''
  return `${request.body}${ctaSuffix}${hashtagSuffix}`.trim()
}
