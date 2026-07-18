import type { InboundInboxEvent, PostMetrics, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  PublishRequest,
  PublishResult,
  SendMessageResult,
  SocialConnectorAdapter,
} from '../interfaces'
import { deriveCodeChallenge, generateCodeVerifier } from './pkce'

// TikTok for Developers — Login Kit (OAuth 2.0 + PKCE) and Content Posting
// API, Direct Post via PULL_FROM_URL (TikTok fetches the video itself,
// rather than this app streaming bytes the way YouTube's upload requires).
// https://developers.tiktok.com/doc/content-posting-api-get-started

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'
const POST_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const POST_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
const SCOPES = ['user.info.basic', 'video.publish']

// Bounded polling: TikTok processes a PULL_FROM_URL post asynchronously.
// This app is a serverless request/response route, not a long-running
// worker, so it polls briefly and then reports "still processing" rather
// than blocking indefinitely — the post keeps processing on TikTok's side
// regardless of whether this app is still watching.
const STATUS_POLL_ATTEMPTS = 5
const STATUS_POLL_INTERVAL_MS = 2_000

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
  })

  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null

  if (!response.ok || (payload?.error && payload.error.code !== 'ok')) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`
    throw new Error(`TikTok API error: ${detail}`)
  }

  return payload?.data as T
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toConnectedAccount(token: TokenResponse, nickname: string): ConnectedAccount {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scopes: token.scope.split(',').filter(Boolean),
    externalAccountId: token.open_id,
    handle: nickname,
  }
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

  async refreshAccessToken(_platform: SocialPlatform, refreshToken: string): Promise<ConnectedAccount> {
    const token = await requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }))
    const creatorInfo = await tiktokApi<{ creator_nickname: string }>(CREATOR_INFO_URL, token.access_token, {})
    return toConnectedAccount(token, creatorInfo.creator_nickname)
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const mediaUrl = request.metadata.mediaUrl
    if (typeof mediaUrl !== 'string' || !mediaUrl) {
      // Honest gap, same as YouTube/Instagram: no PR attaches media to a
      // Revision yet, and TikTok's Direct Post API requires a video.
      throw new Error('TikTok requires a video URL. Attach one to this draft before scheduling (not yet built).')
    }

    // Confirms the creator can currently post and surfaces TikTok's own
    // per-account limits (duration, privacy options) before attempting one.
    const creatorInfo = await tiktokApi<{
      max_video_post_duration_sec: number
      privacy_level_options: string[]
    }>(CREATOR_INFO_URL, request.accessToken, {})

    if (!creatorInfo.privacy_level_options.includes('SELF_ONLY')) {
      throw new Error('This TikTok account does not support SELF_ONLY posts, which this app is limited to before API audit.')
    }

    const title = [request.title ?? request.body, request.cta].filter(Boolean).join(' ')
    // AIGC = "AI-generated content" as defined by TikTok's disclosure
    // policy — about the video/audio itself, not whether the caption text
    // was AI-assisted. This app has no way to know that about the attached
    // media, so it only sets the flag when explicitly told to.
    const isAigcContent = request.metadata.isAigcContent === true

    const init = await tiktokApi<{ publish_id: string }>(POST_INIT_URL, request.accessToken, {
      post_info: {
        title,
        // Hardcoded: unaudited apps can only post SELF_ONLY. Making this
        // configurable is future work for once the app passes TikTok's
        // Content Posting API audit (see docs/master-plan.md §6 phase 2).
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        ...(isAigcContent ? { aigc_info: { is_aigc: true } } : {}),
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: mediaUrl,
      },
    })

    for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
      await sleep(STATUS_POLL_INTERVAL_MS)

      const status = await tiktokApi<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(
        POST_STATUS_URL,
        request.accessToken,
        { publish_id: init.publish_id },
      )

      if (status.status === 'PUBLISH_COMPLETE') {
        const postId = status.publicaly_available_post_id?.[0]
        return { externalPostId: postId ?? init.publish_id, externalUrl: undefined }
      }
      if (status.status === 'FAILED') {
        throw new Error(`TikTok post failed: ${status.fail_reason ?? 'unknown reason'}`)
      }
      // PROCESSING_DOWNLOAD / PROCESSING_UPLOAD / SEND_TO_USER_INBOX: keep polling.
    }

    // Still processing after the poll budget. This app only ever records
    // success when TikTok has actually confirmed PUBLISH_COMPLETE — never
    // claim success just because polling gave up. The post keeps processing
    // on TikTok's side regardless; a human can check the TikTok app and use
    // "Mark as posted" from the Queue if it did complete.
    throw new Error(
      `TikTok is still processing this post after ${STATUS_POLL_ATTEMPTS * (STATUS_POLL_INTERVAL_MS / 1000)}s (timed out waiting). Check the TikTok app — if it completed, use "Mark as posted" from the Queue.`,
    )
  }

  // Honest gap, not a stub: the Content Posting API scope this app requests
  // (user.info.basic, video.publish) does not include reading engagement
  // data, and TikTok's separate Display/Research APIs that do require a
  // distinct application review this app has not completed — see
  // docs/master-plan.md §6 phase 2.
  private readonly readAccessGap =
    "TikTok comment/mention/DM sync is not available: this app's Content Posting API scope does not include reading engagement data, and TikTok's Display API requires separate application review not yet completed."

  async fetchInbox(): Promise<InboundInboxEvent[]> {
    throw new Error(this.readAccessGap)
  }

  async fetchComments(): Promise<InboundInboxEvent[]> {
    throw new Error(this.readAccessGap)
  }

  async fetchMentions(): Promise<InboundInboxEvent[]> {
    throw new Error(this.readAccessGap)
  }

  async fetchMessages(): Promise<InboundInboxEvent[]> {
    throw new Error(this.readAccessGap)
  }

  async fetchMetrics(): Promise<PostMetrics> {
    throw new Error(this.readAccessGap)
  }

  async sendMessage(): Promise<SendMessageResult> {
    // TikTok has no third-party consumer DM API — sending replies is not possible.
    throw new Error('TikTokは第三者向けのDM APIを提供していないため、返信の送信は未対応です。')
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://tiktok.com/@${handle.replace('@', '')}`
  }
}
