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
import { deriveCodeChallenge, generateCodeVerifier } from './pkce'

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'
const POST_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const POST_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
const SCOPES = ['user.info.basic', 'video.publish']
const TIKTOK_REQUEST_TIMEOUT_MS = 30_000

const STATUS_POLL_ATTEMPTS = 5
const STATUS_POLL_INTERVAL_MS = 2_000

export const TIKTOK_PENDING_ERROR_PREFIX = 'TIKTOK_PENDING:'

export type TikTokPublishCheck =
  | { state: 'processing' }
  | { state: 'complete'; postId?: string }
  | { state: 'failed'; reason: string }

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function isTikTokConfigured(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY?.trim())
}

export function buildTikTokAuthorizeUrl(state: string, redirectUri: string): { url: string; codeVerifier: string } {
  const clientKey = requireEnv('TIKTOK_CLIENT_KEY')
  const codeVerifier = generateCodeVerifier()
  const challenge = deriveCodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  return { url: `${AUTHORIZE_URL}?${params.toString()}`, codeVerifier }
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  open_id: string
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const clientKey = requireEnv('TIKTOK_CLIENT_KEY')
  const clientSecret = requireEnv('TIKTOK_CLIENT_SECRET')
  body.set('client_key', clientKey)
  body.set('client_secret', clientSecret)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(TIKTOK_REQUEST_TIMEOUT_MS),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || (payload as { error?: string } | null)?.error) {
    throw new Error(`TikTok token request failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`)
  }

  return payload as TokenResponse
}

async function tiktokApi<T>(url: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIKTOK_REQUEST_TIMEOUT_MS),
  })

  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null

  if (!response.ok || (payload?.error && payload.error.code !== 'ok')) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`
    throw new Error(`TikTok API error: ${detail}`)
  }

  return payload?.data as T
}

/**
 * Direct Post init starts TikTok's irreversible PULL_FROM_URL operation. Once
 * this request crosses the provider boundary, a lost response or 5xx cannot
 * prove that no post was started. Mark those outcomes unsafe to retry rather
 * than create a second publish operation with no way to reconcile the first.
 */
async function initTikTokPublish(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ publish_id: string }> {
  let response: Response
  try {
    response = await fetch(POST_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIKTOK_REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'network error'
    throw new Error(
      `EXTERNAL_RESULT_UNKNOWN: TikTok publish initialization lost its response (${detail}). A post may already be processing, so automatic retry is blocked.`,
    )
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { publish_id?: unknown }
    error?: { code: string; message: string }
  } | null

  if (!response.ok || (payload?.error && payload.error.code !== 'ok')) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`
    if (response.status >= 500) {
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: TikTok publish initialization returned ${response.status}. A post may already be processing, so automatic retry is blocked. Detail: ${detail}`,
      )
    }
    throw new Error(`TikTok API error: ${detail}`)
  }

  const publishId = payload?.data?.publish_id
  if (typeof publishId !== 'string' || !publishId) {
    throw new Error(
      'EXTERNAL_RESULT_UNKNOWN: TikTok accepted publish initialization but returned no publish_id. A post may already be processing, so automatic retry is blocked.',
    )
  }

  return { publish_id: publishId }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toRefreshedCredentials(token: TokenResponse): RefreshedCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scopes: token.scope.split(',').filter(Boolean),
  }
}

function toConnectedAccount(token: TokenResponse, nickname: string): ConnectedAccount {
  return {
    ...toRefreshedCredentials(token),
    externalAccountId: token.open_id,
    handle: nickname,
  }
}

interface TikTokPublishStatusResponse {
  status: string
  fail_reason?: string
  publicaly_available_post_id?: string[]
}

export function parseTikTokPendingPublishId(message: string | null | undefined): string | null {
  if (!message?.startsWith(TIKTOK_PENDING_ERROR_PREFIX)) return null
  const remainder = message.slice(TIKTOK_PENDING_ERROR_PREFIX.length)
  const separator = remainder.indexOf(':')
  const publishId = (separator === -1 ? remainder : remainder.slice(0, separator)).trim()
  return publishId || null
}

export async function checkTikTokPublishStatus(accessToken: string, publishId: string): Promise<TikTokPublishCheck> {
  const status = await tiktokApi<TikTokPublishStatusResponse>(POST_STATUS_URL, accessToken, { publish_id: publishId })

  if (status.status === 'PUBLISH_COMPLETE') {
    return { state: 'complete', postId: status.publicaly_available_post_id?.[0] }
  }
  if (status.status === 'FAILED') {
    return { state: 'failed', reason: status.fail_reason ?? 'unknown reason' }
  }
  return { state: 'processing' }
}

export class TikTokConnectorAdapter implements SocialConnectorAdapter {
  async connect(_platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount> {
    if (!options.codeVerifier) throw new Error('TikTok requires a PKCE code_verifier to complete the OAuth exchange.')

    const token = await requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: options.redirectUri,
        code_verifier: options.codeVerifier,
      }),
    )

    const creatorInfo = await tiktokApi<{ creator_nickname: string }>(CREATOR_INFO_URL, token.access_token, {})
    return toConnectedAccount(token, creatorInfo.creator_nickname)
  }

  async disconnect(): Promise<void> {
    // No explicit revocation call: removing the stored credentials (done by
    // the caller) is sufficient — the token simply stops being used.
  }

  async refreshAccessToken(_platform: SocialPlatform, refreshToken: string): Promise<RefreshedCredentials> {
    // TikTok may return a new refresh token. Persist it immediately; creator
    // profile lookup is not part of credential renewal and must not be able to
    // discard a successful rotating-token response.
    const token = await requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }))
    return toRefreshedCredentials(token)
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const mediaUrl = request.metadata.mediaUrl
    if (typeof mediaUrl !== 'string' || !mediaUrl) {
      throw new Error('TikTok requires a video URL. Attach a video to this Seed (or set mediaUrl on the Revision) before scheduling.')
    }
    const trustedMediaUrl = assertTrustedPublishMediaUrl(mediaUrl).toString()

    if (typeof request.metadata.coverUrl === 'string' && request.metadata.coverUrl) {
      throw new Error(
        'TikTok Content Posting API does not accept a custom cover image. Remove the cover still or use coverTimestampMs to pick a frame. Publish stopped before creating a post.',
      )
    }

    const creatorInfo = await tiktokApi<{
      max_video_post_duration_sec: number
      privacy_level_options: string[]
    }>(CREATOR_INFO_URL, request.accessToken, {})

    if (!creatorInfo.privacy_level_options.includes('SELF_ONLY')) {
      throw new Error('This TikTok account does not support SELF_ONLY posts, which this app is limited to before API audit.')
    }

    const title = [request.title ?? request.body, request.cta].filter(Boolean).join(' ')
    const isAigcContent = request.metadata.isAigcContent === true
    const coverTimestampMs = typeof request.metadata.coverTimestampMs === 'number' && Number.isFinite(request.metadata.coverTimestampMs)
      ? Math.max(0, Math.round(request.metadata.coverTimestampMs))
      : undefined

    const init = await initTikTokPublish(request.accessToken, {
      post_info: {
        title,
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        ...(coverTimestampMs !== undefined ? { video_cover_timestamp_ms: coverTimestampMs } : {}),
        ...(isAigcContent ? { aigc_info: { is_aigc: true } } : {}),
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: trustedMediaUrl,
      },
    })

    for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
      await sleep(STATUS_POLL_INTERVAL_MS)

      // init.publish_id above already started a real post on TikTok's side —
      // a transient failure checking its status (network blip, momentary API
      // error) must not throw away that publish_id, or the caller would
      // record this as a failed publish and a retry would start a second
      // real post. Treat a failed status check as still-processing and keep
      // polling; it still falls through to the pending-error below on
      // exhaustion, which lets a retry check this same operation.
      const status = await checkTikTokPublishStatus(request.accessToken, init.publish_id).catch(
        (): TikTokPublishCheck => ({ state: 'processing' }),
      )
      if (status.state === 'complete') {
        return { externalPostId: status.postId ?? init.publish_id, externalUrl: undefined }
      }
      if (status.state === 'failed') {
        throw new Error(`TikTok post failed: ${status.reason}`)
      }
    }

    throw new Error(
      `${TIKTOK_PENDING_ERROR_PREFIX}${init.publish_id}:TikTok is still processing this post after ${STATUS_POLL_ATTEMPTS * (STATUS_POLL_INTERVAL_MS / 1000)}s. Retry will check this existing publish before starting a new one.`,
    )
  }

  private readonly readAccessGap =
    "TikTok comment/mention/DM sync is not available: this app's Content Posting API scope does not include reading engagement data, and TikTok's Display API requires separate application review not yet completed."

  async fetchInbox(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchComments(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchMentions(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchMessages(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchMetrics(): Promise<PostMetrics> { throw new Error(this.readAccessGap) }

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error('TikTokは第三者向けのDM APIを提供していないため、返信の送信は未対応です。')
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://tiktok.com/@${handle.replace('@', '')}`
  }
}
