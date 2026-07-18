'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { InboxItem } from '@/lib/domain/types'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'

// The concierge block for one inbound DM: it surfaces the AI's soft summary
// ("この方はこう仰っています") and priority, the guesses it made (assumptions),
// an editable "recommended reply", and an approve-and-send control with a
// recipient-appropriate-time vs. send-now choice. It also reflects the state of
// any reply job already created for this item (scheduled / sent / failed).
//
// Honesty (CLAUDE.md #4 #5 #7):
// - Generating a summary/suggestion works for any DM, but SENDING is Phase-1
//   LINE-only. Instagram DMs show a clear "受信のみ" state; sending is deferred
//   until Meta's messaging permission + review.
// - When Anthropic is unconfigured the suggestion is a template, shown as such
//   (the generate call returns source 'template-fallback' with a reason).
// - Nothing sends without the human pressing 承認して送信.

const PRIORITY_LABELS: Record<'high' | 'normal' | 'low', string> = {
  high: '優先度: 高',
  normal: '優先度: 中',
  low: '優先度: 低',
}

const PRIORITY_STYLES: Record<'high' | 'normal' | 'low', string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  normal: 'border-sky-200 bg-sky-50 text-sky-700',
  low: 'border-stone-200 bg-stone-50 text-stone-500',
}

function formatJst(value: string): string {
  return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export default function ConciergeReplyPanel({ item }: { item: InboxItem }) {
  const {
    currentMember,
    socialAccounts,
    generateInboxReply,
    getReplySuggestion,
    getReplyJob,
    approveAndSendReply,
    triggerReplyJob,
    cancelReplyJob,
  } = useApp()

  const suggestion = getReplySuggestion(item.id)
  const replyJob = getReplyJob(item.id)

  const [replyText, setReplyText] = useState(suggestion?.suggestedText ?? '')
  const [timing, setTiming] = useState<'recommended' | 'now'>('recommended')
  const [busy, setBusy] = useState<null | 'generate' | 'send' | 'trigger' | 'cancel'>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // The suggestion text should seed the editor once, but not clobber the user's
  // edits on every re-render. Track which suggestion id we've already applied.
  const [seededFrom, setSeededFrom] = useState<string | null>(suggestion?.id ?? null)

  const canReply = Boolean(currentMember && hasPermission(currentMember.role, 'reply_inbox'))
  const lineConnected = useMemo(
    () => socialAccounts.some((account) => account.platform === 'line' && account.connected),
    [socialAccounts],
  )

  // Phase 1 send matrix: LINE sends; Instagram is receive-only; others unsupported.
  const sendSupported = item.platform === 'line'
  const isInstagram = item.platform === 'instagram'

  // Seed the editor when a newer suggestion arrives (e.g. right after generate).
  if (suggestion && suggestion.id !== seededFrom) {
    setSeededFrom(suggestion.id)
    setReplyText(suggestion.suggestedText)
  }

  const resetMessages = () => {
    setError('')
    setNotice('')
  }

  const handleGenerate = async () => {
    resetMessages()
    setBusy('generate')
    try {
      const result = await generateInboxReply(item.id)
      setReplyText(result.reply)
      setSeededFrom(result.suggestionId)
      if (result.source === 'template-fallback') {
        setNotice(result.reason ?? 'AIが未設定のため、定型文を表示しています。')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '返信案を作成できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const handleApproveAndSend = async () => {
    resetMessages()
    if (!replyText.trim()) {
      setError('送信する返信本文を入力してください。')
      return
    }
    setBusy('send')
    try {
      const result = await approveAndSendReply({
        inboxItemId: item.id,
        replyText: replyText.trim(),
        suggestionId: suggestion?.id,
        sendNow: timing === 'now',
      })
      if (result.status === 'sent') setNotice('返信を送信しました。')
      else if (result.status === 'scheduled') setNotice('相手に適した時刻に送信予約しました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '返信を送信できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const handleTrigger = async () => {
    resetMessages()
    if (!replyJob) return
    setBusy('trigger')
    try {
      await triggerReplyJob(replyJob.id)
      setNotice('返信を送信しました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '送信できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = async () => {
    resetMessages()
    if (!replyJob) return
    setBusy('cancel')
    try {
      await cancelReplyJob(replyJob.id)
      setNotice('返信予約を取り消しました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取り消せませんでした。')
    } finally {
      setBusy(null)
    }
  }

  // An active (scheduled) job locks the composer — you can send now or cancel,
  // but not silently queue a second reply on top of a pending one.
  const hasPendingJob = replyJob?.status === 'scheduled'

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">🪄</span>
        <p className="text-sm font-semibold text-violet-800">AIコンシェルジュ</p>
      </div>

      {/* Summary + priority */}
      {item.aiSummary ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-500">この方はこう仰っています</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">{item.aiSummary}</p>
          {item.aiPriority && (
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[item.aiPriority]}`}>
              {PRIORITY_LABELS[item.aiPriority]}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          {canReply
            ? 'AIに要約と返信案を作ってもらいましょう。'
            : 'AIによる要約・返信案はまだありません。'}
        </p>
      )}

      {/* Assumptions the AI guessed */}
      {suggestion && suggestion.assumptions.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-700">AIの推測（確認してください）</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
            {suggestion.assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Generate button (when no suggestion yet) */}
      {!suggestion && canReply && (
        <button
          onClick={handleGenerate}
          disabled={busy === 'generate'}
          className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy === 'generate' ? '作成中…' : 'AI返信案を作成'}
        </button>
      )}

      {/* Recommended reply editor + send controls */}
      {suggestion && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-500">おすすめの返信</p>
            <span className="text-[11px] text-gray-400">
              {suggestion.source === 'ai' ? `AI提案${suggestion.tone ? `・${suggestion.tone}` : ''}` : '定型文'}
            </span>
          </div>

          <textarea
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            rows={4}
            disabled={hasPendingJob || !canReply}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-stone-50 disabled:text-gray-500"
            placeholder="返信内容を編集できます…"
          />

          {canReply && !hasPendingJob && sendSupported && (
            <>
              {!lineConnected && (
                <p className="mt-2 text-xs text-amber-700">
                  LINE公式アカウントが未接続です。
                  <Link href="/app/settings" className="ml-1 font-medium text-violet-700 hover:text-violet-900">
                    設定から接続 →
                  </Link>
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-stone-200 bg-white p-0.5 text-xs">
                  <button
                    onClick={() => setTiming('recommended')}
                    className={`rounded-full px-3 py-1.5 font-medium transition ${timing === 'recommended' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    おすすめの時刻
                  </button>
                  <button
                    onClick={() => setTiming('now')}
                    className={`rounded-full px-3 py-1.5 font-medium transition ${timing === 'now' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    今すぐ
                  </button>
                </div>
                <button
                  onClick={handleApproveAndSend}
                  disabled={busy === 'send' || !lineConnected}
                  className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {busy === 'send' ? '送信中…' : '承認して送信'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                {timing === 'recommended'
                  ? '相手の生活時間に合わせた時刻に自動送信します（深夜は避けます）。'
                  : 'すぐに送信します。'}
              </p>
            </>
          )}

          {/* Honest disabled states for sending */}
          {canReply && !hasPendingJob && isInstagram && (
            <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-gray-500">
              Instagram DMは現在<strong>受信のみ</strong>対応です（送信はMetaのメッセージ送信権限と審査が必要なため、今後対応予定）。要約と返信案の作成まではご利用いただけます。
            </p>
          )}
          {canReply && !hasPendingJob && !sendSupported && !isInstagram && (
            <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-gray-500">
              この媒体への返信送信は現在未対応です（Phase 1で送信できるのはLINEのみです）。
            </p>
          )}
        </div>
      )}

      {/* Reply job status */}
      {replyJob && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
          {replyJob.status === 'scheduled' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-700">🕒 {formatJst(replyJob.scheduledAt)} に送信予定</span>
              {canReply && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={handleTrigger} disabled={busy === 'trigger'} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50 disabled:opacity-50">
                    今すぐ送信
                  </button>
                  <button onClick={handleCancel} disabled={busy === 'cancel'} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50 disabled:opacity-50">
                    取り消し
                  </button>
                </div>
              )}
            </div>
          )}
          {replyJob.status === 'sent' && (
            <span className="text-green-700">✓ 送信済み{replyJob.sentAt ? `（${formatJst(replyJob.sentAt)}）` : ''}</span>
          )}
          {replyJob.status === 'failed' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-rose-700">✗ 送信失敗{replyJob.errorMessage ? `: ${replyJob.errorMessage}` : ''}</span>
              {canReply && sendSupported && (
                <button onClick={handleTrigger} disabled={busy === 'trigger'} className="ml-auto rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50 disabled:opacity-50">
                  再送
                </button>
              )}
            </div>
          )}
          {replyJob.status === 'cancelled' && <span className="text-gray-400">取り消し済み</span>}
        </div>
      )}

      {notice && <p className="mt-3 text-xs text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
    </div>
  )
}
