'use client'

import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import InboxItemCard from '@/components/ui/InboxItemCard'
import EmptyState from '@/components/ui/EmptyState'
import { MOCK_INBOX_ITEMS } from '@/lib/mock/seed'
import type { InboxItem, InboxKind } from '@/lib/domain/types'

type FilterTab = 'all' | InboxKind | 'unread' | 'needs_action'

const TABS: Array<{ label: string; value: FilterTab }> = [
  { label: 'All', value: 'all' },
  { label: 'DMs', value: 'dm' },
  { label: 'Comments', value: 'comment' },
  { label: 'Replies', value: 'reply' },
  { label: 'Mentions', value: 'mention' },
  { label: 'Unread', value: 'unread' },
  { label: 'Needs Action', value: 'needs_action' },
]

function filterItems(items: InboxItem[], tab: FilterTab): InboxItem[] {
  switch (tab) {
    case 'all': return items
    case 'unread': return items.filter((i) => !i.isRead)
    case 'needs_action': return items.filter((i) => i.needsAction)
    default: return items.filter((i) => i.kind === tab)
  }
}

export default function InboxPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [items, setItems] = useState<InboxItem[]>(MOCK_INBOX_ITEMS)

  const filtered = filterItems(items, activeTab).sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  )

  const handleMarkRead = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)))
  }

  const handleStar = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isStarred: !i.isStarred } : i)))
  }

  const unreadCount = items.filter((i) => !i.isRead).length

  return (
    <div>
      <PageHeader
        title="Inbox"
        description={`${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`}
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="No inbox items match the current filter."
        />
      ) : (
        <div className="space-y-3 max-w-2xl">
          {filtered.map((item) => (
            <InboxItemCard
              key={item.id}
              item={item}
              onMarkRead={handleMarkRead}
              onStar={handleStar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
