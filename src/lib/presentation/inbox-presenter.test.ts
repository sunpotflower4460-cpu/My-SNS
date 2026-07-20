import { describe, expect, it } from 'vitest'
import {
  compareForInbox,
  filterInboxItems,
  groupInboxItems,
  inboxCounts,
  priorityBadge,
} from './inbox-presenter'
import type { InboxItem } from '@/lib/domain/types'

function item(over: Partial<InboxItem>): InboxItem {
  return {
    id: 'i1',
    workspaceId: 'w',
    platform: 'line',
    kind: 'dm',
    authorHandle: 'someone',
    text: 'hi',
    receivedAt: '2026-07-20T00:00:00Z',
    isRead: false,
    needsAction: false,
    isStarred: false,
    ...over,
  }
}

describe('compareForInbox', () => {
  it('orders high priority before normal/low/unscored', () => {
    const items = [
      item({ id: 'low', aiPriority: 'low' }),
      item({ id: 'none' }),
      item({ id: 'high', aiPriority: 'high' }),
      item({ id: 'normal', aiPriority: 'normal' }),
    ]
    expect([...items].sort(compareForInbox).map((i) => i.id)).toEqual(['high', 'normal', 'low', 'none'])
  })

  it('within equal priority, needs-action wins, then recency', () => {
    const items = [
      item({ id: 'old', receivedAt: '2026-07-19T00:00:00Z' }),
      item({ id: 'new', receivedAt: '2026-07-20T00:00:00Z' }),
      item({ id: 'flagged', needsAction: true, receivedAt: '2026-07-18T00:00:00Z' }),
    ]
    expect([...items].sort(compareForInbox).map((i) => i.id)).toEqual(['flagged', 'new', 'old'])
  })
})

describe('filterInboxItems', () => {
  const items = [
    item({ id: 'dm', kind: 'dm', isRead: true }),
    item({ id: 'comment', kind: 'comment', needsAction: true }),
    item({ id: 'starred', kind: 'mention', isStarred: true }),
  ]
  it('filters by kind, unread, needs_action, starred', () => {
    expect(filterInboxItems(items, 'dm').map((i) => i.id)).toEqual(['dm'])
    expect(filterInboxItems(items, 'unread').map((i) => i.id)).toEqual(['comment', 'starred'])
    expect(filterInboxItems(items, 'needs_action').map((i) => i.id)).toEqual(['comment'])
    expect(filterInboxItems(items, 'starred').map((i) => i.id)).toEqual(['starred'])
    expect(filterInboxItems(items, 'all')).toHaveLength(3)
  })
})

describe('priorityBadge', () => {
  it('shows 急ぎ for high priority, outranking 要対応', () => {
    expect(priorityBadge(item({ aiPriority: 'high', needsAction: true }))).toEqual({ label: '急ぎ', tone: 'error' })
  })
  it('shows 要対応 for a flagged non-high item', () => {
    expect(priorityBadge(item({ needsAction: true }))).toEqual({ label: '要対応', tone: 'warning' })
  })
  it('shows nothing for a routine item', () => {
    expect(priorityBadge(item({ aiPriority: 'normal' }))).toBeNull()
  })
})

describe('groupInboxItems', () => {
  it('splits into urgent / action / rest, drops empty groups, orders within', () => {
    const items = [
      item({ id: 'r1', receivedAt: '2026-07-19T00:00:00Z' }),
      item({ id: 'u1', aiPriority: 'high' }),
      item({ id: 'a1', needsAction: true }),
      item({ id: 'r2', receivedAt: '2026-07-20T00:00:00Z' }),
    ]
    const groups = groupInboxItems(items)
    expect(groups.map((g) => g.key)).toEqual(['urgent', 'action', 'rest'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['u1'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['a1'])
    // rest sorted by recency (r2 newer than r1)
    expect(groups[2].items.map((i) => i.id)).toEqual(['r2', 'r1'])
  })

  it('a high-priority item that also needs action lands in urgent, not action', () => {
    const groups = groupInboxItems([item({ id: 'x', aiPriority: 'high', needsAction: true })])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('urgent')
  })

  it('returns no groups for an empty inbox', () => {
    expect(groupInboxItems([])).toEqual([])
  })
})

describe('inboxCounts', () => {
  it('counts unread, urgent, and needs-action', () => {
    const items = [
      item({ isRead: false, aiPriority: 'high' }),
      item({ isRead: true, needsAction: true }),
      item({ isRead: false }),
    ]
    expect(inboxCounts(items)).toEqual({ unread: 2, urgent: 1, needsAction: 1 })
  })
})
