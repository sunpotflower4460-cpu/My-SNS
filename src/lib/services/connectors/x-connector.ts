import type { InboxItem, SocialPlatform } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  ConnectOptions,
  PublishRequest,
  PublishResult,
  SocialConnectorAdapter,
} from '../interfaces'
import { deriveCodeChallenge, generateCodeVerifier } from './pkce'

// X (Twitter) API v2, OAuth 2.0 Authorization Code + PKCE.
// https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code

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

/** PKCE is generated here — the caller persists the returned verifier in oauth_states for the callback to use. */
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

  async disconnect(): Promise<void> {
    // X does not require an explicit revocation call for this flow; removing
    // the stored credentials (done by the caller) is sufficient — the app
    // simply stops using the token, which expires on its own.
  }

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

    for (const text of tweets) {
      const payload = await postTweetWithRetry(text, previousId, request.accessToken)
      previousId = payload.data.id
      firstId = firstId ?? payload.data.id
    }

    if (!username) {
      const account = await fetchAuthenticatedHandle(request.accessToken)
      username = account.username
    }

    return {
      externalPostId: firstId,
      externalUrl: firstId ? `https://x.com/${username}/status/${firstId}` : undefined,
    }
  }

  async fetchInbox(): Promise<InboxItem[]> {
    throw new Error('X inbox sync is not implemented yet (planned for PR6).')
  }

  async fetchComments(): Promise<InboxItem[]> {
    throw new Error('X comment sync is not implemented yet (planned for PR6).')
  }

  async fetchMentions(): Promise<InboxItem[]> {
    throw new Error('X mention sync is not implemented yet (planned for PR6).')
  }

  async fetchMessages(): Promise<InboxItem[]> {
    throw new Error('X message sync is not implemented yet (planned for PR6).')
  }

  generateOpenUrl(_platform: SocialPlatform, handle: string): string {
    return `https://x.com/${handle.replace('@', '')}`
  }
}

// Bounded per master-plan §3's "429 → single retry" rule for X. If the
// provider wants a longer wait than this, don't block the request — throw
// and let the job fail with reason "ratelimit"; the Queue's own retry
// (built in PR3) picks it up on its next pass instead.
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

    const response = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

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

    return (await response.json()) as TweetPayload
  }
}

export function buildFirstTweetText(request: PublishRequest): string {
  const ctaSuffix = request.cta ? ` ${request.cta}` : ''
  const hashtagSuffix = request.hashtags.length > 0 ? ` ${request.hashtags.map((tag) => `#${tag}`).join(' ')}` : ''
  // No client-side length truncation: if the approved content plus CTA and
  // hashtags exceeds X's limit, the API rejects it with a clear validation
  // error rather than this code silently cutting the approved text short.
  return `${request.body}${ctaSuffix}${hashtagSuffix}`.trim()
}
