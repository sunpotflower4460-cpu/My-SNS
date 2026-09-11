'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Sheet } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { canSendReply } from '@/lib/channels/reply-capability'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { InboxItem } from '@/lib/domain/types'

interface BulkReplyReviewPanelProps {
  open: boolean
  onClose: () => void
  items: InboxItem[]
}

type SendStatus = 'sent' | 'scheduled' | 'error'

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

/**
 * Review-and-send screen for the "一括おすすめ返信" flow. This is the human
 * approval step CLAUDE.md #4 requires: every suggestion here was AI-proposed
 * (via generateBulkInboxReplies), never sent, and stays fully editable until
 * the person clicks 「すべて送信」— which then sends each sendable item
 * individually through the exact same /api/inbox/reply/approve path a single
 * reply uses (same idempotency, same fail-closed platform gating). Items
 * canSendReply() says can't be sent (TikTok, Instagram DM, …) only ever get a
 * copy button here — never included in the bulk send.
 */
export default function BulkReplyReviewPanel({ open, onClose, items }: BulkReplyReviewPanelProps) {
  const { getReplySuggestion, approveAndSendReply } = useApp()

  const [texts, setTexts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<Record<string, SendStatus>>({})
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({})
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState('')

  useEffect(() => {
    if (!open) return
    setTexts((current) => {
      let changed = false
      const next = { ...current }
      for (const item of items) {
        if (!(item.id in next)) {
          next[item.id] = getReplySuggestion(item.id)?.suggestedText ?? ''
          changed = true
        }
      }
      return changed ? next : current
    })
    // Intentional: seed drafts once per open/items-list change, not on every
    // getReplySuggestion identity change (it is a fresh closure each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items])

  const sendableItems = items.filter((item) => canSendReply(item.platform, item.kind))
  const copyOnlyItems = items.filter((item) => !canSendReply(item.platform, item.kind))
  const pendingSendableCount = sendableItems.filter((item) => !sendStatus[item.id]).length

  const handleSendAll = async () => {
    setSending(true)
    setSummary('')
    let sentCount = 0
    let failedCount = 0
    for (const item of sendableItems) {
      if (sendStatus[item.id]) continue // already sent/scheduled in an earlier click
      const text = (texts[item.id] ?? '').trim()
      if (!text) {
        setSendStatus((prev) => ({ ...prev, [item.id]: 'error' }))
        setSendErrors((prev) => ({ ...prev, [item.id]: '返信本文が空です。' }))
        failedCount += 1
        continue
      }
      try {
        const suggestion = getReplySuggestion(item.id)
        const result = await approveAndSendReply({
          inboxItemId: item.id,
          replyText: text,
          suggestionId: suggestion?.id,
          sendNow: true,
        })
        setSendStatus((prev) => ({ ...prev, [item.id]: result.status === 'failed' ? 'error' : (result.status as SendStatus) }))
        if (result.status === 'failed') {
          failedCount += 1
          setSendErrors((prev) => ({ ...prev, [item.id]: '送信に失敗しました。' }))
        } else {
          sentCount += 1
        }
      } catch (cause) {
        setSendStatus((prev) => ({ ...prev, [item.id]: 'error' }))
        setSendErrors((prev) => ({ ...prev, [item.id]: cause instanceof Error ? cause.message : '送信に失敗しました。' }))
        failedCount += 1
      }
    }
    setSending(false)
    setSummary(`${sentCount}件送信しました${failedCount > 0 ? `（失敗${failedCount}件）` : ''}。`)
  }

  const handleCopy = async (item: InboxItem) => {
    try {
      await copyText(texts[item.id] ?? '')
      setCopiedIds((prev) => new Set(prev).add(item.id))
    } catch {
      // Clipboard permission denial is not worth a full error banner here —
      // the textarea itself is still selectable/copyable by hand.
    }
  }

  const renderItem = (item: InboxItem, sendable: boolean) => {
    const label = PUBLISHING_CHANNEL_CONFIG[item.platform]?.label ?? item.platform
    const status = sendStatus[item.id]
    return (
      <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge tone="neutral">{label}</Badge>
            <span className="truncate text-xs text-gray-500">{item.authorHandle}</span>
          </div>
          {status === 'sent' && <Badge tone="success">✓ 送信済み</Badge>}
          {status === 'scheduled' && <Badge tone="info">送信予約済み</Badge>}
          {status === 'error' && <Badge tone="error">失敗</Badge>}
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-gray-400">{item.text}</p>
        <textarea
          value={texts[item.id] ?? ''}
          onChange={(event) => setTexts((prev) => ({ ...prev, [item.id]: event.target.value }))}
          disabled={status === 'sent' || status === 'scheduled'}
          rows={3}
          className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-stone-50 disabled:text-gray-500"
        />
        {sendErrors[item.id] && <p className="mt-1 text-xs text-rose-600">{sendErrors[item.id]}</p>}
        {!sendable && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-400">{label}への返信送信は未対応です。コピーして直接返信してください。</p>
            <Button size="sm" variant="secondary" onClick={() => void handleCopy(item)}>
              {copiedIds.has(item.id) ? 'コピー済み' : 'コピー'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`おすすめ返信のレビュー（${items.length}件）`}
      footer={
        <div className="flex w-full flex-col gap-2">
          {summary && <p className="text-xs text-gray-600">{summary}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>閉じる</Button>
            {sendableItems.length > 0 && (
              <Button variant="primary" loading={sending} disabled={sending || pendingSendableCount === 0} onClick={() => void handleSendAll()}>
                {pendingSendableCount === 0 ? '送信済み' : `送信可能な${pendingSendableCount}件をすべて送信`}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {sendableItems.map((item) => renderItem(item, true))}
        {copyOnlyItems.map((item) => renderItem(item, false))}
      </div>
    </Sheet>
  )
}
