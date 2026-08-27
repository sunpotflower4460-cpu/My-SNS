'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import InboxItemCard from '@/components/ui/InboxItemCard'
import ConciergeReplyPanel from '@/components/ui/ConciergeReplyPanel'
import CreatorStatusBar from '@/components/ui/CreatorStatusBar'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import {
  filterInboxItems,
  groupInboxItems,
  inboxCounts,
  type FilterTab,
} from '@/lib/presentation/inbox-presenter'

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

export default function InboxPage() {
  const { addInboxNote, currentMember, getInboxNotes, inboxItems, seeds, toggleInboxNeedsAction, toggleInboxRead, toggleInboxStar } = useApp()
  const canMutateInbox = Boolean(currentMember && hasPermission(currentMember.role, 'reply_inbox'))
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  // Filter first, then split into priority groups (急ぎ / 対応が必要 / そのほか) so
  // the messages that need a fast reply stay at the top even within a filter.
  const groups = useMemo(() => groupInboxItems(filterInboxItems(inboxItems, activeTab)), [activeTab, inboxItems])
  const counts = useMemo(() => inboxCounts(inboxItems), [inboxItems])

  const description =
    counts.urgent > 0
      ? `急ぎの返信が${counts.urgent}件、未読が${counts.unread}件あります。`
      : `未読の会話が${counts.unread}件あります。`

  const runInboxAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action()
      setFeedback(successMessage)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '受信箱の更新に失敗しました。')
      setFeedback('')
    }
  }

  const renderItem = (item: (typeof inboxItems)[number]) => {
    const notes = getInboxNotes(item.id)
    return (
      <div key={item.id}>
        <InboxItemCard
          item={item}
          notes={notes}
          noteDraft={draftNotes[item.id] ?? ''}
          relatedSeedTitle={
            item.seedId ? seeds.find((seed) => seed.id === item.seedId)?.title ?? 'リンクされたシード' : null
          }
          relatedSeedHref={item.seedId ? `/app/seeds/${item.seedId}` : null}
          onChangeNote={(value) => setDraftNotes((prev) => ({ ...prev, [item.id]: value }))}
          onSaveNote={canMutateInbox ? () => {
            if (!draftNotes[item.id]?.trim()) return
            void runInboxAction(async () => {
              await addInboxNote(item.id, draftNotes[item.id])
              setDraftNotes((prev) => ({ ...prev, [item.id]: '' }))
            }, '内部メモをこのワークスペースに保存しました。')
          } : undefined}
          onToggleRead={canMutateInbox ? () => {
            void runInboxAction(() => toggleInboxRead(item.id), item.isRead ? '未読にしました。' : '既読にしました。')
          } : undefined}
          onToggleStar={canMutateInbox ? () => {
            void runInboxAction(
              () => toggleInboxStar(item.id),
              item.isStarred ? 'スターを外しました。' : 'フォローアップ用にスターを付けました。',
            )
          } : undefined}
          onToggleNeedsAction={canMutateInbox ? () => {
            void runInboxAction(
              () => toggleInboxNeedsAction(item.id),
              item.needsAction ? '要対応を解除しました。' : '要対応としてフラグを立てました。',
            )
          } : undefined}
        />
        {/* The concierge (summary + reply proposal + timed send) is for
            conversational DMs — comments/mentions/replies use notes only. */}
        {item.kind === 'dm' && <ConciergeReplyPanel item={item} />}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="受信箱" description={description} />

      <CreatorStatusBar />

      {feedback && (
        <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {feedback}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            aria-pressed={activeTab === tab.value}
            className={`inline-flex min-h-touch items-center justify-center rounded-full px-3.5 text-sm font-medium transition sm:min-h-control ${
              activeTab === tab.value
                ? 'bg-violet-600 text-white shadow-sm'
                : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState title="該当する項目がありません" description="現在のフィルター条件に一致する受信箱の項目はありません。" />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.heading}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold text-gray-900">{group.heading}</h2>
                <span className="text-xs text-gray-400">{group.items.length}件</span>
                {group.description && <p className="w-full text-xs text-gray-400 sm:w-auto">{group.description}</p>}
              </div>
              <div className="space-y-4">{group.items.map((item) => renderItem(item))}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
