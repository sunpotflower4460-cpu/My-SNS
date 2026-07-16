import type { InboundInboxEvent } from '@/lib/domain/types'

export interface MetaWebhookChange {
  field: string
  value?: {
    id?: string
    text?: string
    from?: { id: string; username?: string }
  }
}

export interface MetaWebhookMessagingEvent {
  sender?: { id: string }
  timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean }
}

export interface MetaWebhookEntry {
  id: string
  time?: number
  changes?: MetaWebhookChange[]
  messaging?: MetaWebhookMessagingEvent[]
}

export interface MetaWebhookPayload {
  object?: string
  entry?: MetaWebhookEntry[]
}

/**
 * Maps one Meta webhook `entry` into inbox events. Only the `comments`
 * change field and Instagram Messaging `messaging` array are handled.
 * `mentions` is a documented, honest gap: Meta's mentions webhook payload
 * only carries a media_id/comment_id pointer, not the comment text itself —
 * resolving it needs an extra authenticated Graph API call this app does
 * not make (see InstagramConnectorAdapter.fetchMentions).
 */
export function mapMetaWebhookEntry(entry: MetaWebhookEntry): InboundInboxEvent[] {
  const events: InboundInboxEvent[] = []
  const entryTimeMs = (entry.time ?? Math.floor(Date.now() / 1000)) * 1000

  for (const change of entry.changes ?? []) {
    if (change.field !== 'comments') continue
    const value = change.value
    if (!value?.id || !value.text) continue

    events.push({
      platform: 'instagram',
      kind: 'comment',
      externalId: value.id,
      authorHandle: value.from?.username ?? value.from?.id ?? 'unknown',
      text: value.text,
      receivedAt: new Date(entryTimeMs).toISOString(),
    })
  }

  for (const event of entry.messaging ?? []) {
    // Our own reply, echoed back by the Messenger Platform — not an inbound item.
    if (event.message?.is_echo) continue
    if (!event.message?.mid || !event.message.text || !event.sender?.id) continue

    events.push({
      platform: 'instagram',
      kind: 'dm',
      externalId: event.message.mid,
      authorHandle: event.sender.id,
      text: event.message.text,
      // Messenger Platform timestamps are milliseconds since epoch already
      // (unlike `entry.time` above, which is seconds).
      receivedAt: new Date(event.timestamp ?? Date.now()).toISOString(),
    })
  }

  return events
}
