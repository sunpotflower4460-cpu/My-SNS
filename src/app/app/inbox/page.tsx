'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import InboxItemCard from '@/components/ui/InboxItemCard'
import EmptyState from '@/components/ui/EmptyState'
import { useMockApp } from '@/lib/mock/store/provider'
import type { InboxItem, InboxKind } from '@/lib/domain/types'

type FilterTab = 'all' | InboxKind | 'unread' | 'needs_action' | 'starred'

const TABS: Array<{ label: string; value: FilterTab }> = [
  { label: 'All', value: 'all' },
  { label: 'DMs', value: 'dm' },
  { label: 'Comments', value: 'comment' },
  { label: 'Replies', value: 'reply' },
  { label: 'Mentions', value: 'mention' },
  { label: 'Unread', value: 'unread' },
  { label: 'Needs Action', value: 'needs_action' },
  { label: 'Starred', value: 'starred' },
]

function filterItems(items: InboxItem[], tab: FilterTab): InboxItem[] {
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

export default function InboxPage() {
  const { addInboxNote, getInboxNotes, inboxItems, toggleInboxNeedsAction, toggleInboxRead, toggleInboxStar } = useMockApp()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})

  const filtered = useMemo(
    () => filterItems(inboxItems, activeTab).sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime()),
    [activeTab, inboxItems],
  )

  const unreadCount = inboxItems.filter((item) => !item.isRead).length

  return (
    <div>
      <PageHeader title="Inbox" description={`${unreadCount} unread conversation${unreadCount !== 1 ? 's' : ''} in the active workspace.`} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${activeTab === tab.value ? 'bg-violet-600 text-white shadow-sm' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing here" description="No inbox items match the current filter." />
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const notes = getInboxNotes(item.id)
            return (
              <InboxItemCard
                key={item.id}
                item={item}
                notes={notes}
                noteDraft={draftNotes[item.id] ?? ''}
                onChangeNote={(value) => setDraftNotes((prev) => ({ ...prev, [item.id]: value }))}
                onSaveNote={() => {
                  if (!draftNotes[item.id]?.trim()) return
                  addInboxNote(item.id, draftNotes[item.id])
                  setDraftNotes((prev) => ({ ...prev, [item.id]: '' }))
                }}
                onToggleRead={() => toggleInboxRead(item.id)}
                onToggleStar={() => toggleInboxStar(item.id)}
                onToggleNeedsAction={() => toggleInboxNeedsAction(item.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
