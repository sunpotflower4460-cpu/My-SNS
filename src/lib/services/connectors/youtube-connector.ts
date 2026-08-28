import type { InboundInboxEvent, PostMetrics, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  InboxFetchRequest,
  PublishRequest,
  PublishResult,
  RefreshedCredentials,
  SendMessageResult,
  SocialConnectorAdapter,
} from '../interfaces'
import { assertTrustedPublishMediaUrl } from '@/lib/security/trusted-publish-media-url'

// YouTube Data API v3, Google OAuth 2.0, resumable upload.
// https://developers.google.com/youtube/v3/guides/uploading_a_video

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'
const THUMBNAILS_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/thumbnails'
const COMMENT_THREADS_URL = 'https://www.googleapis.com/youtube/v3/commentThreads'
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'
const STUDIO_URL = 'https://studio.youtube.com'
// youtube.upload is listed on thumbnails.set, but setting a custom thumbnail
// in practice needs a write scope that can edit the uploaded video. Request
// youtube.force-ssl in addition; already-connected accounts must reconnect.
export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
export const YOUTUBE_FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
export const YOUTUBE_MANAGE_SCOPE = 'https://www.googleapis.com/auth/youtube'
const SCOPES = [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_FORCE_SSL_SCOPE, YOUTUBE_READONLY_SCOPE]

const YOUTUBE_THUMBNAIL_SCOPES = [
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_MANAGE_SCOPE,
  'https://www.googleapis.com/auth/youtubepartner',
]

export function youtubeScopesAllowCustomThumbnail(scopes: string[] | undefined): boolean {
  if (!scopes || scopes.length === 0) return false
  return scopes.some((scope) => YOUTUBE_THUMBNAIL_SCOPES.includes(scope))
}

const COMMENT_PAGE_SIZE = 50
const YOUTUBE_API_TIMEOUT_MS = 30_000

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
    signal: AbortSignal.timeout(YOUTUBE_API_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`YouTube token request failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  return response.json() as Promise<TokenResponse>
}

async function fetchOwnChannel(accessToken: string): Promise<{ id: string; title: string }> {
  const url = `${CHANNELS_URL}?part=snippet&mine=true`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(YOUTUBE_API_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`YouTube channel lookup failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as { items?: Array<{ id: string; snippet: { title: string } }> }
  const channel = payload.items?.[0]
  if (!channel) throw new Error('No YouTube channel found for this Google account.')

  return { id: channel.id, title: channel.snippet.title }
}

export interface CommentThreadsResponse {
  items?: Array<{
    snippet: {
      topLevelComment: {
        id: string
        snippet: {
          authorDisplayName?: string
          authorProfileImageUrl?: string
          textDisplay?: string
          publishedAt?: string
        }
      }
    }
  }>
}

export function mapCommentThreads(payload: CommentThreadsResponse): InboundInboxEvent[] {
  return (payload.items ?? []).map((item) => {
    const top = item.snippet.topLevelComment
    return {
      platform: 'youtube' as const,
      kind: 'comment' as const,
      externalId: top.id,
      authorHandle: top.snippet.authorDisplayName ?? 'unknown',
      authorAvatarUrl: top.snippet.authorProfileImageUrl,
      text: top.snippet.textDisplay ?? '',
      receivedAt: top.snippet.publishedAt ?? new Date().toISOString(),
    }
  })
}

async function fetchCommentThreads(accessToken: string, params: Record<string, string>): Promise<InboundInboxEvent[]> {
  const url = `${COMMENT_THREADS_URL}?${new URLSearchParams({
    part: 'snippet',
    order: 'time',
    maxResults: String(COMMENT_PAGE_SIZE),
    ...params,
  }).toString()}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(YOUTUBE_API_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`YouTube comment fetch failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  return mapCommentThreads((await response.json()) as CommentThreadsResponse)
}

interface VideoStatisticsResponse {
  items?: Array<{
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
  }>
}

async function fetchVideoStatistics(accessToken: string, videoId: string): Promise<PostMetrics> {
  const url = `${VIDEOS_URL}?${new URLSearchParams({ part: 'statistics', id: videoId }).toString()}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(YOUTUBE_API_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`YouTube metrics lookup failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as VideoStatisticsResponse
  const stats = payload.items?.[0]?.statistics
  if (!stats) throw new Error(`YouTube returned no statistics for video ${videoId} — it may have been removed.`)

  return {
    views: stats.viewCount !== undefined ? Number(stats.viewCount) : undefined,
    likes: stats.likeCount !== undefined ? Number(stats.likeCount) : undefined,
    comments: stats.commentCount !== undefined ? Number(stats.commentCount) : undefined,
  }
}

function toRefreshedCredentials(token: TokenResponse): RefreshedCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scopes: token.scope.split(' ').filter(Boolean),
  }
}

function toConnectedAccount(token: TokenResponse, channel: { id: string; title: string }): ConnectedAccount {
  return {
    ...toRefreshedCredentials(token),
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

  async refreshAccessToken(_platform: SocialPlatform, refreshToken: string): Promise<RefreshedCredentials> {
    // Account identity is already durable in social_accounts. Refresh only the
    // credential; a later channel/profile lookup must not turn a successful
    // token refresh into a failure before the new access token is persisted.
    const token = await requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }))
    return { ...toRefreshedCredentials(token), refreshToken: undefined }
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const mediaUrl = request.metadata.mediaUrl
    if (typeof mediaUrl !== 'string' || !mediaUrl) {
      throw new Error(
        `YouTube requires a video file. Attach an image/video to this Seed (channel assignment optional) before scheduling — or upload directly at ${STUDIO_URL}.`,
      )
    }

    const trustedMediaUrl = assertTrustedPublishMediaUrl(mediaUrl)
    const thumbnailUrl = typeof request.metadata.thumbnailUrl === 'string' ? request.metadata.thumbnailUrl : undefined
    const grantedScopes = Array.isArray(request.metadata.grantedScopes)
      ? request.metadata.grantedScopes.filter((scope): scope is string => typeof scope === 'string')
      : undefined

    if (thumbnailUrl && !youtubeScopesAllowCustomThumbnail(grantedScopes)) {
      throw new Error(
        'YouTube custom thumbnail requires a reconnect so this account includes the youtube.force-ssl scope. Open Settings, disconnect YouTube, and connect it again before scheduling a thumbnail.',
      )
    }

    let thumbnailBytes: ArrayBuffer | undefined
    let thumbnailContentType = 'image/jpeg'
    if (thumbnailUrl) {
      const trustedThumbnailUrl = assertTrustedPublishMediaUrl(thumbnailUrl)
      const thumbnailResponse = await fetch(trustedThumbnailUrl, { signal: AbortSignal.timeout(FETCH_MEDIA_TIMEOUT_MS) })
      if (!thumbnailResponse.ok) {
        throw new Error(`Could not read the YouTube thumbnail image (${thumbnailResponse.status}). Custom thumbnail was requested, so publish stopped before uploading the video.`)
      }
      thumbnailContentType = thumbnailResponse.headers.get('content-type') ?? 'image/jpeg'
      if (!thumbnailContentType.startsWith('image/')) {
        throw new Error('YouTube custom thumbnail must be a PNG or JPG image. Publish stopped before uploading the video.')
      }
      thumbnailBytes = await thumbnailResponse.arrayBuffer()
    }

    const isShort = request.metadata.isShort === true
    if (isShort && thumbnailBytes) {
      throw new Error('YouTube Shorts cannot use a custom thumbnail. Remove the thumbnail or publish as a 16:9 long video.')
    }

    const requestedPrivacy = request.metadata.privacyStatus
    const privacyStatus =
      requestedPrivacy === 'private' || requestedPrivacy === 'unlisted' || requestedPrivacy === 'public'
        ? requestedPrivacy
        : 'public'

    const description = [request.body, request.cta].filter(Boolean).join('\n\n')
    const tags = request.hashtags.slice(0, 500)

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
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
      signal: AbortSignal.timeout(YOUTUBE_API_TIMEOUT_MS),
    })

    if (!initResponse.ok) {
      const detail = await initResponse.text().catch(() => '')
      throw new Error(
        `YouTube upload could not start (${initResponse.status}): ${detail.slice(0, 300)} — try uploading directly at ${STUDIO_URL}.`,
      )
    }

    const uploadUrl = initResponse.headers.get('location')
    if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL.')

    const videoResponse = await fetch(trustedMediaUrl, { signal: AbortSignal.timeout(FETCH_MEDIA_TIMEOUT_MS) })
    if (!videoResponse.ok || !videoResponse.body) {
      throw new Error(`Could not read the video from its source URL (${videoResponse.status}).`)
    }

    let uploadResponse: Response
    try {
      uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': videoResponse.headers.get('content-type') ?? 'video/*' },
        body: videoResponse.body,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        // @ts-expect-error Node's fetch requires this for streaming request bodies.
        duplex: 'half',
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'network error'
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: YouTube upload lost its final response (${detail}). The video may already have been created, so automatic retry is blocked.`,
      )
    }

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '')
      if (uploadResponse.status >= 500) {
        throw new Error(
          `EXTERNAL_RESULT_UNKNOWN: YouTube upload returned ${uploadResponse.status} after video bytes were sent. The video may already exist, so automatic retry is blocked. Detail: ${detail.slice(0, 200)}`,
        )
      }
      throw new Error(
        `YouTube upload failed (${uploadResponse.status}): ${detail.slice(0, 300)} — try uploading directly at ${STUDIO_URL}.`,
      )
    }

    let payload: unknown
    try {
      payload = await uploadResponse.json()
    } catch {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: YouTube accepted the upload but returned an unreadable response. The video may already exist, so automatic retry is blocked.',
      )
    }

    const videoId = (payload as { id?: unknown } | null)?.id
    if (typeof videoId !== 'string' || !videoId) {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: YouTube accepted the upload but returned no video id. The video may already exist, so automatic retry is blocked.',
      )
    }

    const actualPrivacy = (payload as { status?: { privacyStatus?: unknown } } | null)?.status?.privacyStatus
    if (privacyStatus === 'public' && typeof actualPrivacy === 'string' && actualPrivacy !== 'public') {
      throw new Error(
        `PARTIAL_EXTERNAL_SUCCESS: YouTube accepted the upload as ${actualPrivacy} instead of public (video ${videoId}). Automatic retry is blocked. Verify the channel and set visibility in Studio: ${STUDIO_URL}.`,
      )
    }

    if (thumbnailBytes) {
      const thumbResponse = await fetch(`${THUMBNAILS_UPLOAD_URL}/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.accessToken}`,
          'Content-Type': thumbnailContentType,
        },
        body: thumbnailBytes,
        signal: AbortSignal.timeout(YOUTUBE_API_TIMEOUT_MS),
      }).catch((cause) => {
        const detail = cause instanceof Error ? cause.message : 'network error'
        throw new Error(
          `PARTIAL_EXTERNAL_SUCCESS: YouTube video ${videoId} was created but the custom thumbnail request was lost (${detail}). Automatic retry is blocked — set the thumbnail in Studio: ${STUDIO_URL}.`,
        )
      })

      if (!thumbResponse.ok) {
        const detail = await thumbResponse.text().catch(() => '')
        throw new Error(
          `PARTIAL_EXTERNAL_SUCCESS: YouTube video ${videoId} was created but the custom thumbnail failed (${thumbResponse.status}). Automatic retry is blocked. ${detail.slice(0, 200)} Set the thumbnail in Studio: ${STUDIO_URL}.`,
        )
      }
    }

    return { externalPostId: videoId, externalUrl: `https://youtube.com/watch?v=${videoId}` }
  }

  async fetchInbox(request: InboxFetchRequest): Promise<InboundInboxEvent[]> {
    if (!request.externalAccountId) throw new Error('YouTube inbox sync requires the connected channel id.')
    return fetchCommentThreads(request.accessToken, { allThreadsRelatedToChannelId: request.externalAccountId })
  }

  async fetchComments(request: InboxFetchRequest & { postId: string }): Promise<InboundInboxEvent[]> {
    return fetchCommentThreads(request.accessToken, { videoId: request.postId })
  }

  async fetchMentions(): Promise<InboundInboxEvent[]> {
    throw new Error('YouTube has no mentions API — the Data API only exposes comments on your own videos/channel.')
  }

  async fetchMessages(): Promise<InboundInboxEvent[]> {
    throw new Error('YouTube has no direct-message API for creators.')
  }

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error('YouTube has no direct-message API for creators — sending replies is not possible.')
  }

  async fetchMetrics(request: InboxFetchRequest & { postId: string }): Promise<PostMetrics> {
    return fetchVideoStatistics(request.accessToken, request.postId)
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://youtube.com/@${handle.replace('@', '')}`
  }
}
