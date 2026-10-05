/**
 * Read-only inbound-event projection for Artist OS / relationship intelligence
 * (contract: Artist-OS src/contracts/inbound.ts, v1). My-SNS is the canonical inbound owner.
 *
 * Privacy: no tokens, no raw provider payloads. A text excerpt is exposed only for PUBLIC
 * kinds (comment/mention/reply). DM bodies are never exposed.
 */
export const INBOUND_CONTRACT_VERSION = 1 as const
export const INBOUND_ROW_LIMIT = 100
const EXCERPT_MAX = 280
const NATIVE_ID_PREFIXES = ['ig-comment-', 'ig-dm-', 'sa-ig-comment-', 'sa-ig-dm-']
const PLATFORMS = new Set(['instagram', 'x', 'youtube', 'line', 'tiktok', 'threads', 'facebook'])

export interface InboxRow {
  id: string
  platform: string
  kind: string
  external_id: string | null
  author_handle: string | null
  text: string | null
  received_at: string
  needs_action: boolean
  contact_external_id: string | null
  /** Seed this item relates to (id only: no title/body). */
  seed_id?: string | null
}
export interface ReplyJobRef {
  inbox_item_id: string
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled'
}

export interface InboundEventOut {
  sourceSystem: 'my-sns'
  eventId: string
  platform: string
  kind: 'comment' | 'dm' | 'mention' | 'reply'
  externalEventId: string
  receivedAt: string
  contactRef?: { platform: string; externalContactId: string }
  authorHandle?: string
  textExcerpt?: string
  /** Related Seed id (opaque ref; no content). */
  seedRef?: string
  needsAction: boolean
  replyState: 'none' | 'scheduled' | 'sent' | 'failed' | 'cancelled'
  ownerSystem: 'my-sns'
}

export function buildInboundEvents(input: { now: Date; rows: InboxRow[]; replyJobs: ReplyJobRef[] }) {
  // The most advanced reply state per inbox item: sent > scheduled > failed > cancelled.
  const rank = { sent: 4, scheduled: 3, failed: 2, cancelled: 1 } as const
  const best = new Map<string, ReplyJobRef['status']>()
  for (const j of input.replyJobs) {
    const cur = best.get(j.inbox_item_id)
    if (!cur || rank[j.status] > rank[cur]) best.set(j.inbox_item_id, j.status)
  }
  const events: InboundEventOut[] = []
  for (const r of input.rows) {
    if (!r.external_id || !PLATFORMS.has(r.platform) || !['comment', 'dm', 'mention', 'reply'].includes(r.kind)) continue
    let id = r.external_id.trim()
    for (const p of NATIVE_ID_PREFIXES) if (id.startsWith(p)) id = id.slice(p.length)
    if (!/^[A-Za-z0-9._\-=]{1,200}$/.test(id)) continue // not a native id the ledger can key on
    const isDm = r.kind === 'dm'
    events.push({
      sourceSystem: 'my-sns',
      eventId: r.id,
      platform: r.platform,
      kind: r.kind as InboundEventOut['kind'],
      externalEventId: id,
      receivedAt: new Date(r.received_at).toISOString(),
      ...(r.contact_external_id ? { contactRef: { platform: r.platform, externalContactId: r.contact_external_id.slice(0, 200) } } : {}),
      ...(r.author_handle ? { authorHandle: r.author_handle.slice(0, 100) } : {}),
      ...(r.seed_id ? { seedRef: r.seed_id } : {}),
      ...(!isDm && r.text ? { textExcerpt: r.text.slice(0, EXCERPT_MAX) } : {}),
      needsAction: r.needs_action,
      replyState: best.get(r.id) ?? 'none',
      ownerSystem: 'my-sns',
    })
  }
  return { contractVersion: INBOUND_CONTRACT_VERSION, service: 'my-sns' as const, generatedAt: input.now.toISOString(), events }
}
