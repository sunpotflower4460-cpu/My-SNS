import type { InboundInboxEvent } from '@/lib/domain/types'

export interface LineWebhookSource {
  type?: string
  userId?: string
  groupId?: string
  roomId?: string
}

export interface LineWebhookMessage {
  id?: string
  type?: string
  text?: string
}

export interface LineWebhookEvent {
  type?: string
  timestamp?: number
  source?: LineWebhookSource
  message?: LineWebhookMessage
  replyToken?: string
  /** true when LINE re-delivers a previously sent event; the inbox dedup index absorbs it, but this lets callers skip work early. */
  redelivery?: boolean
}

export interface LineWebhookBody {
  destination?: string
  events?: LineWebhookEvent[]
}

/**
 * Maps a LINE Messaging API webhook body into inbox events. Phase 1 handles
 * only text messages from a 1:1 user source (`source.userId`). Documented,
 * honest gaps: non-text messages (image/sticker/file/location), group/room
 * sources (no per-person userId to reply to), and non-message events
 * (follow/join/postback) are not ingested.
 *
 * We deliberately do NOT carry the `replyToken`: reply tokens expire ~1 minute
 * after delivery and are single-use, but our replies are scheduled and sent
 * via push to `source.userId` (see line-connector.sendMessage).
 */
export function mapLineWebhookBody(body: LineWebhookBody): InboundInboxEvent[] {
  const events: InboundInboxEvent[] = []

  for (const event of body.events ?? []) {
    if (event.type !== 'message') continue
    if (event.message?.type !== 'text') continue

    const userId = event.source?.userId
    if (!userId || !event.message.id || !event.message.text) continue

    events.push({
      platform: 'line',
      kind: 'dm',
      externalId: event.message.id,
      authorHandle: userId,
      text: event.message.text,
      receivedAt: new Date(event.timestamp ?? Date.now()).toISOString(),
    })
  }

  return events
}
