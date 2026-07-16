import type { InboxItem, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  PublishRequest,
  PublishResult,
  SocialConnectorAdapter,
} from '../interfaces'

// YouTube Data API v3, Google OAuth 2.0, resumable upload.
// https://developers.google.com/youtube/v3/guides/uploading_a_video

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'
const STUDIO_URL = 'https://studio.youtube.com'
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']

// Deliberately shorter than the calling route's `maxDuration` (300s — see
// api/publish/run and api/publish/trigger). A platform hard-kill on timeout
// happens mid-execution with no chance to run our own catch block, which
// would leave the job claimed and unrecorded until it's later treated as
// abandoned. Timing out here first means processPublishJob's normal error
// handling actually runs and records a real failure instead.
const FETCH_MEDIA_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 270_000

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_CLIENT_ID?.trim())
}

export function buildYouTubeAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('YOUTUBE_CLIENT_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    access_type: 'offline',
    // Forces Google to always return a refresh_token, even on a
    // previously-authorized reconnect — without this it's only returned once.
    prompt: 'consent',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const clientId = requireEnv('YOUTUBE_CLIENT_ID')
  const clientSecret = requireEnv('YOUTUBE_CLIENT_SECRET')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`YouTube token request failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  return response.json() as Promise<TokenResponse>
}

async function fetchOwnChannel(accessToken: string): Promise<{ id: string; title: string }> {
  const url = `${CHANNELS_URL}?part=snippet&mine=true`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`YouTube channel lookup failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as { items?: Array<{ id: string; snippet: { title: string } }> }
  const channel = payload.items?.[0]
  if (!channel) throw new Error('No YouTube channel found for this Google account.')

  return { id: channel.id, title: channel.snippet.title }
}

function toConnectedAccount(token: TokenResponse, channel: { id: string; title: string }): ConnectedAccount {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scopes: token.scope.split(' ').filter(Boolean),
    externalAccountId: channel.id,
    handle: channel.title,
  }
}

export class YouTubeConnectorAdapter implements SocialConnectorAdapter {
  async connect(_platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount> {
    const token = await requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: options.redirectUri,
      }),
    )
    const channel = await fetchOwnChannel(token.access_token)
    return toConnectedAccount(token, channel)
  }

  async disconnect(): Promise<void> {
    // No explicit revocation call: removing the stored credentials (done by
    // the caller) is sufficient — Google tokens simply stop being used.
  }

  async refreshAccessToken(_platform: SocialPlatform, refreshToken: string): Promise<ConnectedAccount> {
    const token = await requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }))
    // Google does not re-issue a refresh_token on refresh; keep the caller's.
    const channel = await fetchOwnChannel(token.access_token)
    return { ...toConnectedAccount(token, channel), refreshToken: undefined }
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const mediaUrl = request.metadata.mediaUrl
    if (typeof mediaUrl !== 'string' || !mediaUrl) {
      // Honest gap: no PR has built Seed-asset-to-Revision media attachment
      // yet, and YouTube's API requires this app to stream actual video
      // bytes (there is no "just give me a URL" upload path). Fail closed
      // rather than attempting a request that can only fail.
      throw new Error(
        `YouTube requires a video file. Attach one to this draft before scheduling (not yet built) — or upload directly at ${STUDIO_URL}.`,
      )
    }

    const isShort = request.metadata.isShort === true
    const description = [request.body, request.cta].filter(Boolean).join('\n\n')
    const tags = request.hashtags.slice(0, 500) // YouTube's own tag list cap

    const initResponse = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/*',
      },
      body: JSON.stringify({
        snippet: {
          title: request.title ?? 'Untitled',
          description: isShort ? `${description}\n\n#Shorts`.trim() : description,
          tags,
        },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
      }),
    })

    if (!initResponse.ok) {
      const detail = await initResponse.text().catch(() => '')
      throw new Error(
        `YouTube upload could not start (${initResponse.status}): ${detail.slice(0, 300)} — try uploading directly at ${STUDIO_URL}.`,
      )
    }

    const uploadUrl = initResponse.headers.get('location')
    if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL.')

    const videoResponse = await fetch(mediaUrl, { signal: AbortSignal.timeout(FETCH_MEDIA_TIMEOUT_MS) })
    if (!videoResponse.ok || !videoResponse.body) {
      throw new Error(`Could not read the video from its source URL (${videoResponse.status}).`)
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': videoResponse.headers.get('content-type') ?? 'video/*' },
      body: videoResponse.body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      // @ts-expect-error Node's fetch requires this for streaming request bodies.
      duplex: 'half',
    })

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '')
      throw new Error(
        `YouTube upload failed (${uploadResponse.status}): ${detail.slice(0, 300)} — try uploading directly at ${STUDIO_URL}.`,
      )
    }

    const video = (await uploadResponse.json()) as { id: string }
    return { externalPostId: video.id, externalUrl: `https://youtube.com/watch?v=${video.id}` }
  }

  async fetchInbox(): Promise<InboxItem[]> {
    throw new Error('YouTube inbox sync is not implemented yet (planned for PR6).')
  }

  async fetchComments(): Promise<InboxItem[]> {
    throw new Error('YouTube comment sync is not implemented yet (planned for PR6).')
  }

  async fetchMentions(): Promise<InboxItem[]> {
    throw new Error('YouTube mention sync is not implemented yet (planned for PR6).')
  }

  async fetchMessages(): Promise<InboxItem[]> {
    throw new Error('YouTube message sync is not implemented yet (planned for PR6).')
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://youtube.com/@${handle.replace('@', '')}`
  }
}
