import type { InboundInboxEvent, PostMetrics, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  InboxFetchRequest,
  PublishRequest,
  PublishResult,
  SendMessageResult,
  SocialConnectorAdapter,
} from '../interfaces'
import { deriveCodeChallenge, generateCodeVerifier } from './pkce'

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const TWEETS_URL = 'https://api.twitter.com/2/tweets'
const ME_URL = 'https://api.twitter.com/2/users/me'
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access']

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function isXConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID?.trim())
}

export function buildXAuthorizeUrl(state: string, redirectUri: string): { url: string; codeVerifier: string } {
  const clientId = requireEnv('X_CLIENT_ID')
  const codeVerifier = generateCodeVerifier()
  const challenge = deriveCodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  return { url: `${AUTHORIZE_URL}?${params.toString()}`, codeVerifier }
}

interface TokenResponse {
  token_type: string
  expires_in: number
  access_token: string
  scope: string
  refresh_token?: string
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const clientId = requireEnv('X_CLIENT_ID')
  const clientSecret = requireEnv('X_CLIENT_SECRET')
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`X token request failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  return response.json() as Promise<TokenResponse>
}

async function fetchAuthenticatedHandle(accessToken: string): Promise<{ id: string; username: string }> {
  const response = await fetch(`${ME_URL}?user.fields=username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`X user lookup failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as { data: { id: string; username: string } }
  return payload.data
}

function toConnectedAccount(token: TokenResponse, account: { id: string; username: string }): ConnectedAccount {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scopes: token.scope.split(' ').filter(Boolean),
    externalAccountId: account.id,
    handle: account.username,
  }
}

export class XConnectorAdapter implements SocialConnectorAdapter {
  async connect(_platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount> {
    if (!options.codeVerifier) throw new Error('X requires a PKCE code_verifier to complete the OAuth exchange.')

    const token = await requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: options.redirectUri,
        code_verifier: options.codeVerifier,
      }),
    )
    const account = await fetchAuthenticatedHandle(token.access_token)
    return toConnectedAccount(token, account)
  }

  async disconnect(): Promise<void> {}

  async refreshAccessToken(_platform: SocialPlatform, refreshToken: string): Promise<ConnectedAccount> {
    const token = await requestToken(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    )
    const account = await fetchAuthenticatedHandle(token.access_token)
    return toConnectedAccount(token, account)
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const thread = Array.isArray(request.metadata.thread)
      ? (request.metadata.thread as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : []
    const tweets = [buildFirstTweetText(request), ...thread]

    let previousId: string | undefined
    let firstId: string | undefined
    let username = request.handle

    for (let index = 0; index < tweets.length; index += 1) {
      const text = tweets[index]
      try {
        const payload = await postTweetWithRetry(text, previousId, request.accessToken)
        previousId = payload.data.id
        firstId = firstId ?? payload.data.id
      } catch (cause) {
        if (firstId) {
          const detail = cause instanceof Error ? cause.message : 'unknown X error'
          const knownUrl = username ? ` https://x.com/${username}/status/${firstId}` : ''
          throw new Error(
            `PARTIAL_EXTERNAL_SUCCESS: X posted ${index} of ${tweets.length} thread tweets before a later step failed.${knownUrl} Automatic retry is blocked to prevent duplicate tweets. Original error: ${detail}`,
          )
        }
        throw cause
      }
    }

    // Username lookup is only URL enrichment after the irreversible tweets are
    // already live. Do not turn an enrichment failure into a retryable publish.
    if (!username) {
      try {
        const account = await fetchAuthenticatedHandle(request.accessToken)
        username = account.username
      } catch (cause) {
        console.warn(`X tweet ${firstId ?? 'unknown'} published, but username lookup failed:`, cause)
      }
    }

    return {
      externalPostId: firstId,
      externalUrl: firstId && username ? `https://x.com/${username}/status/${firstId}` : undefined,
    }
  }

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error('X DMの送信は有料APIティア（Basic以上、dm.write）が必要なため未対応です。')
  }

  private readonly readAccessGap =
    'X comment/mention/DM sync requires a paid X API tier (Basic or higher) for read access, or an Enterprise Account Activity API subscription for webhooks — this app only requests the free-tier write scopes needed to publish. Not available.'

  async fetchInbox(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchComments(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchMentions(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }
  async fetchMessages(): Promise<InboundInboxEvent[]> { throw new Error(this.readAccessGap) }

  async fetchMetrics(request: InboxFetchRequest & { postId: string }): Promise<PostMetrics> {
    const url = `${TWEETS_URL}/${encodeURIComponent(request.postId)}?tweet.fields=public_metrics`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${request.accessToken}` } })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`X metrics lookup failed (${response.status}): ${detail.slice(0, 300)}`)
    }

    const payload = (await response.json()) as {
      data?: { public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; impression_count?: number } }
    }
    const metrics = payload.data?.public_metrics ?? {}
    return {
      views: metrics.impression_count,
      likes: metrics.like_count,
      comments: metrics.reply_count,
      shares: metrics.retweet_count,
    }
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://x.com/${handle.replace('@', '')}`
  }
}

const MAX_RATE_LIMIT_WAIT_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface TweetPayload {
  data: { id: string; text: string }
}

export async function postTweetWithRetry(text: string, replyToId: string | undefined, accessToken: string): Promise<TweetPayload> {
  let retriedOnce = false

  for (;;) {
    const body: Record<string, unknown> = { text }
    if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }

    let response: Response
    try {
      response = await fetch(TWEETS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'network failure'
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: X publish request lost its response (${detail}). The tweet may already exist, so automatic retry is blocked.`,
      )
    }

    if (response.status === 429) {
      if (!retriedOnce) {
        const resetHeader = response.headers.get('x-rate-limit-reset')
        const resetAtMs = resetHeader ? Number(resetHeader) * 1000 : NaN
        const waitMs = Number.isFinite(resetAtMs) ? resetAtMs - Date.now() : NaN

        if (Number.isFinite(waitMs) && waitMs > 0 && waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
          retriedOnce = true
          await sleep(waitMs)
          continue
        }
      }
      throw new Error('X rate limit exceeded (429). Try again later.')
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`X publish failed (${response.status}): ${detail.slice(0, 300)}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: X returned a successful HTTP status but an unreadable response body. The tweet may already exist, so automatic retry is blocked.',
      )
    }

    const tweet = (payload as { data?: { id?: unknown; text?: unknown } } | null)?.data
    if (typeof tweet?.id !== 'string' || !tweet.id) {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: X returned success without a tweet id. The tweet may already exist, so automatic retry is blocked.',
      )
    }

    return {
      data: {
        id: tweet.id,
        text: typeof tweet.text === 'string' ? tweet.text : text,
      },
    }
  }
}

export function buildFirstTweetText(request: PublishRequest): string {
  const ctaSuffix = request.cta ? ` ${request.cta}` : ''
  const hashtagSuffix = request.hashtags.length > 0 ? ` ${request.hashtags.map((tag) => `#${tag}`).join(' ')}` : ''
  return `${request.body}${ctaSuffix}${hashtagSuffix}`.trim()
}
