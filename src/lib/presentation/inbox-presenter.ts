import type { InboxItem, InboxKind } from '@/lib/domain/types'

// Pure presenter for the 受信箱 (UI-PR3). Ordering, filtering, and priority
// grouping live here — no React — so the concierge's "the messages that need a
// fast reply float to the top" promise is unit-testable. No routes/schema/logic
// change; this only decides how existing inbox items are ordered and grouped.

// Reply-urgency first (AI-judged high → normal → low → unscored), then the human
// "要対応" flag, then most recent.
const PRIORITY_RANK: Record<'high' | 'normal' | 'low', number> = { high: 0, normal: 1, low: 2 }

function priorityRank(item: InboxItem): number {
  return item.aiPriority ? PRIORITY_RANK[item.aiPriority] : 3
}

export function compareForInbox(left: InboxItem, right: InboxItem): number {
  const byPriority = priorityRank(left) - priorityRank(right)
  if (byPriority !== 0) return byPriority
  if (left.needsAction !== right.needsAction) return left.needsAction ? -1 : 1
  return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime()
}

export type FilterTab = 'all' | InboxKind | 'unread' | 'needs_action' | 'starred'

export function filterInboxItems(items: InboxItem[], tab: FilterTab): InboxItem[] {
  switch (tab) {
    case 'all':
      return items
    case 'unread':
      return items.filter((item) => !item.isRead)
    case 'needs_action':
      return items.filter((item) => item.needsAction)
    case 'starred':
      return items.filter((item) => item.isStarred)
    default:
      return items.filter((item) => item.kind === tab)
  }
}

// ─── Priority badge ─────────────────────────────────────────────────────────────

export type PriorityBadgeTone = 'error' | 'warning'

export interface PriorityBadge {
  label: string
  tone: PriorityBadgeTone
}

/**
 * The single most important status pill for one item, or null when it's routine.
 * "急ぎ" (AI judged high) outranks "要対応" (human flag) — a high-priority item
 * that also needs action reads as 急ぎ, the stronger signal. Colour is always
 * paired with the word (the component adds an icon too) — never colour alone.
 */
export function priorityBadge(item: InboxItem): PriorityBadge | null {
  if (item.aiPriority === 'high') return { label: '急ぎ', tone: 'error' }
  if (item.needsAction) return { label: '要対応', tone: 'warning' }
  return null
}

// ─── Grouping ───────────────────────────────────────────────────────────────────

export type InboxGroupKey = 'urgent' | 'action' | 'rest'

export interface InboxGroup {
  key: InboxGroupKey
  heading: string
  description: string
  items: InboxItem[]
}

const GROUP_META: Record<InboxGroupKey, { heading: string; description: string }> = {
  urgent: { heading: 'いま返信したい', description: 'AIが優先度が高いと判断したメッセージです。' },
  action: { heading: '対応が必要', description: '要対応の印をつけたメッセージです。' },
  rest: { heading: 'そのほかの受信', description: '' },
}

/**
 * Split items into three priority groups — 急ぎ / 対応が必要 / そのほか — each
 * internally ordered by compareForInbox. Empty groups are dropped so the page
 * shows only headings that have content.
 */
export function groupInboxItems(items: InboxItem[]): InboxGroup[] {
  const buckets: Record<InboxGroupKey, InboxItem[]> = { urgent: [], action: [], rest: [] }
  for (const item of items) {
    if (item.aiPriority === 'high') buckets.urgent.push(item)
    else if (item.needsAction) buckets.action.push(item)
    else buckets.rest.push(item)
  }
  const order: InboxGroupKey[] = ['urgent', 'action', 'rest']
  return order
    .map((key) => ({ key, ...GROUP_META[key], items: buckets[key].slice().sort(compareForInbox) }))
    .filter((group) => group.items.length > 0)
}

// ─── Summary counts ─────────────────────────────────────────────────────────────

export interface InboxCounts {
  unread: number
  urgent: number
  needsAction: number
}

export function inboxCounts(items: InboxItem[]): InboxCounts {
  return {
    unread: items.filter((item) => !item.isRead).length,
    urgent: items.filter((item) => item.aiPriority === 'high').length,
    needsAction: items.filter((item) => item.needsAction).length,
  }
}
