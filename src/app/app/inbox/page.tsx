'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import InboxItemCard from '@/components/ui/InboxItemCard'
import ConciergeReplyPanel from '@/components/ui/ConciergeReplyPanel'
import CreatorStatusBar from '@/components/ui/CreatorStatusBar'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import type { InboxItem, InboxKind } from '@/lib/domain/types'

// Inbox ordering: reply-urgency first (AI-judged high → normal → low → unscored),
// then human "要対応" flags, then most recent. This is what makes the concierge
// promise real — the messages that need a fast reply float to the top.
const PRIORITY_RANK: Record<'high' | 'normal' | 'low', number> = { high: 0, normal: 1, low: 2 }

function priorityRank(item: InboxItem): number {
  return item.aiPriority ? PRIORITY_RANK[item.aiPriority] : 3
}

function compareForInbox(left: InboxItem, right: InboxItem): number {
  const byPriority = priorityRank(left) - priorityRank(right)
  if (byPriority !== 0) return byPriority
  if (left.needsAction !== right.needsAction) return left.needsAction ? -1 : 1
  return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime()
}

type FilterTab = 'all' | InboxKind | 'unread' | 'needs_action' | 'starred'

const TABS: Array<{ label: string; value: FilterTab }> = [
  { label: 'すべて', value: 'all' },
  { label: 'DM', value: 'dm' },
  { label: 'コメント', value: 'comment' },
  { label: '返信', value: 'reply' },
  { label: 'メンション', value: 'mention' },
  { label: '未読', value: 'unread' },
  { label: '要対応', value: 'needs_action' },
  { label: 'スター付き', value: 'starred' },
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
  const { addInboxNote, getInboxNotes, inboxItems, seeds, toggleInboxNeedsAction, toggleInboxRead, toggleInboxStar } = useApp()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')

  const filtered = useMemo(
    () => filterItems(inboxItems, activeTab).slice().sort(compareForInbox),
    [activeTab, inboxItems],
  )

  const unreadCount = inboxItems.filter((item) => !item.isRead).length

  return (
    <div>
      <PageHeader title="受信箱" description={`現在のワークスペースに未読の会話が${unreadCount}件あります。`} />

      <CreatorStatusBar />

      {feedback && (
        <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {feedback}
        </div>
      )}

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
        <EmptyState title="該当する項目がありません" description="現在のフィルター条件に一致する受信箱の項目はありません。" />
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const notes = getInboxNotes(item.id)
            return (
              <div key={item.id}>
                <InboxItemCard
                  item={item}
                  notes={notes}
                  noteDraft={draftNotes[item.id] ?? ''}
                  relatedSeedTitle={
                    item.seedId
                      ? seeds.find((seed) => seed.id === item.seedId)?.title ?? 'リンクされたシード'
                      : null
                  }
                  relatedSeedHref={item.seedId ? `/app/seeds/${item.seedId}` : null}
                  onChangeNote={(value) => setDraftNotes((prev) => ({ ...prev, [item.id]: value }))}
                  onSaveNote={async () => {
                    if (!draftNotes[item.id]?.trim()) return
                    await addInboxNote(item.id, draftNotes[item.id])
                    setDraftNotes((prev) => ({ ...prev, [item.id]: '' }))
                    setFeedback('内部メモをこのワークスペースに保存しました。')
                  }}
                  onToggleRead={async () => {
                    await toggleInboxRead(item.id)
                    setFeedback(item.isRead ? '未読にしました。' : '既読にしました。')
                  }}
                  onToggleStar={async () => {
                    await toggleInboxStar(item.id)
                    setFeedback(item.isStarred ? 'スターを外しました。' : 'フォローアップ用にスターを付けました。')
                  }}
                  onToggleNeedsAction={async () => {
                    await toggleInboxNeedsAction(item.id)
                    setFeedback(item.needsAction ? '要対応を解除しました。' : '要対応としてフラグを立てました。')
                  }}
                />
                {/* The concierge (summary + reply proposal + timed send) is for
                    conversational DMs — comments/mentions/replies use notes only. */}
                {item.kind === 'dm' && <ConciergeReplyPanel item={item} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
