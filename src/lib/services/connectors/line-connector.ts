import type { InboundInboxEvent, PostMetrics } from '@/lib/domain/types'
import type {
  ConnectedAccount,
  PublishResult,
  SendMessageRequest,
  SendMessageResult,
  SocialConnectorAdapter,
} from '../interfaces'

// LINE Official Account, Messaging API.
// Unlike the OAuth platforms (X/Instagram/YouTube/TikTok), LINE does not use a
// per-user OAuth code exchange for the bot: a long-lived *channel access
// token* (issued in the LINE Developers console) authorizes all Messaging API
// calls. So "connecting" here is not a redirect handshake — it reads the token
// from the environment and resolves the bot's own userId, which doubles as the
// account's external_account_id (the webhook `destination`) and the resolve key
// for incoming events.
// https://developers.line.biz/en/reference/messaging-api/

const BOT_INFO_URL = 'https://api.line.me/v2/bot/info'
const PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const LINE_REQUEST_TIMEOUT_MS = 30_000

// Persisted on reply_jobs.error_message by reply-worker. A retry route must
// recognize this exact prefix: the POST may have reached LINE even though this
// process never received a trustworthy result, so blindly sending again can
// duplicate a real DM.
export const LINE_RESULT_UNKNOWN_PREFIX = 'EXTERNAL_RESULT_UNKNOWN: LINE push'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function isLineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim())
}

interface BotInfoResponse {
  userId: string
  basicId?: string
  displayName?: string
  pictureUrl?: string
}

export function isLineResultUnknownError(message: string | null | undefined): boolean {
  return Boolean(message?.startsWith(LINE_RESULT_UNKNOWN_PREFIX))
}

export class LineConnectorAdapter implements SocialConnectorAdapter {
  async connect(): Promise<ConnectedAccount> {
    const channelToken = requireEnv('LINE_CHANNEL_ACCESS_TOKEN')

    const response = await fetch(BOT_INFO_URL, {
      headers: { Authorization: `Bearer ${channelToken}` },
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`LINE bot info lookup failed (${response.status}): ${detail.slice(0, 300)}`)
    }
    const info = (await response.json()) as BotInfoResponse

    // Channel access tokens are long-lived (the console issues them without an
    // OAuth expiry); a null expiresAt makes resolveCredentials return the token
    // without attempting a refresh.
    return {
      accessToken: channelToken,
      expiresAt: undefined,
      scopes: [],
      externalAccountId: info.userId,
      handle: info.displayName ?? info.basicId ?? info.userId,
    }
  }

  async disconnect(): Promise<void> {
    // Nothing to revoke on LINE's side — the channel token lives in the console.
    // Removing the stored credential (done by the caller) stops the app using it.
  }

  async refreshAccessToken(): Promise<ConnectedAccount> {
    throw new Error('LINEのチャネルアクセストークンは自動更新できません。設定から再接続してください。')
  }

  async publish(): Promise<PublishResult> {
    // LINE is a messaging platform, not a publishing channel — it never flows
    // through the publish Worker. Fail closed rather than pretend otherwise.
    throw new Error('LINEは投稿チャンネルではありません（メッセージ返信のみ対応）。')
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResult> {
    // Push message (not a reply-token reply): reply tokens expire ~1 minute
    // after the inbound event and are single-use, but our sends are scheduled
    // (possibly hours later) and always flow through the reply Worker — so we
    // push to the recipient's userId instead. See docs and the webhook mapper,
    // which deliberately never persists the replyToken.
    let response: Response
    try {
      response = await fetch(PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.accessToken}`,
        },
        body: JSON.stringify({
          to: request.target,
          messages: [{ type: 'text', text: request.text }],
        }),
        signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'network error'
      throw new Error(
        `${LINE_RESULT_UNKNOWN_PREFIX}: the request may have reached LINE but no response was received (${detail}). Automatic retry is blocked to prevent a duplicate message.`,
      )
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      // A provider 5xx after an irreversible POST is not proof that the message
      // was rejected. Treat it like a lost response. 4xx/429 are explicit
      // request rejection and remain ordinarily retryable after correction.
      if (response.status >= 500) {
        throw new Error(
          `${LINE_RESULT_UNKNOWN_PREFIX}: LINE returned ${response.status} after the push request, so delivery cannot be proven either way. Automatic retry is blocked to prevent a duplicate message. Detail: ${detail.slice(0, 200)}`,
        )
      }
      throw new Error(`LINE push failed (${response.status}): ${detail.slice(0, 300)}`)
    }

    return { externalMessageId: response.headers.get('x-line-request-id') ?? undefined }
  }

  // LINE inbox items arrive via signed webhook push (see /api/webhooks/line),
  // not a pull sync — there is no on-demand backfill endpoint, so these fail
  // closed rather than silently returning nothing.
  async fetchInbox(): Promise<InboundInboxEvent[]> {
    throw new Error('LINEの受信はWebhook（/api/webhooks/line）経由のみ対応で、プル取得のエンドポイントはありません。')
  }

  async fetchComments(): Promise<InboundInboxEvent[]> {
    throw new Error('LINEにはコメント機能のAPIがありません。')
  }

  async fetchMentions(): Promise<InboundInboxEvent[]> {
    throw new Error('LINEにはメンション取得のAPIがありません。')
  }

  async fetchMessages(): Promise<InboundInboxEvent[]> {
    throw new Error('LINEのメッセージはWebhook（/api/webhooks/line）経由のみ対応で、プル取得のエンドポイントはありません。')
  }

  async fetchMetrics(): Promise<PostMetrics> {
    throw new Error('LINEは投稿チャンネルではないため、投稿メトリクスはありません。')
  }

  generateOpenUrl(): string {
    return 'https://line.me/'
  }
}
