'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { InboxItem } from '@/lib/domain/types'
import type { ScheduleProposal } from '@/lib/services/interfaces'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'

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

/** Keep durable machine-readable safety markers in DB/logs, never in creator-facing copy. */
function creatorFacingReplyError(message: string | undefined): string {
  return (message ?? '').replace(/^(?:EXTERNAL_RESULT_UNKNOWN|PARTIAL_EXTERNAL_SUCCESS):\s*/u, '')
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
    getMessagingContact,
    setContactAutoSend,
    extractSchedule,
    createCalendarEvent,
  } = useApp()

  const suggestion = getReplySuggestion(item.id)
  const replyJob = getReplyJob(item.id)
  const contact = item.contactId ? getMessagingContact(item.contactId) : null

  const [replyText, setReplyText] = useState(suggestion?.suggestedText ?? '')
  const [timing, setTiming] = useState<'recommended' | 'now'>('recommended')
  const [busy, setBusy] = useState<null | 'generate' | 'send' | 'trigger' | 'cancel' | 'autosend' | 'schedule' | number>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [scheduleProposals, setScheduleProposals] = useState<ScheduleProposal[] | null>(null)
  const [addedProposals, setAddedProposals] = useState<Set<number>>(new Set())
  const [seededFrom, setSeededFrom] = useState<string | null>(suggestion?.id ?? null)

  const canReply = Boolean(currentMember && hasPermission(currentMember.role, 'reply_inbox'))
  const lineConnected = useMemo(
    () => socialAccounts.some((account) => account.platform === 'line' && account.connected),
    [socialAccounts],
  )

  const sendSupported = item.platform === 'line'
  const isInstagram = item.platform === 'instagram'
  const canManageCalendar = Boolean(currentMember && hasPermission(currentMember.role, 'manage_calendar'))
  const replyResultUnknown = Boolean(
    replyJob?.status === 'failed' && replyJob.errorMessage?.startsWith('EXTERNAL_RESULT_UNKNOWN:'),
  )
  const replyErrorText = creatorFacingReplyError(replyJob?.errorMessage)

  if (suggestion && suggestion.id !== seededFrom) {
    setSeededFrom(suggestion.id)
    setReplyText(suggestion.suggestedText)
  }

  const resetMessages = () => {
    setError('')
    setNotice('')
    setWarning('')
  }

  const handleGenerate = async () => {
    resetMessages()
    setBusy('generate')
    try {
      const result = await generateInboxReply(item.id)
      const usageWarning = (result as typeof result & { usageWarning?: string }).usageWarning
      setReplyText(result.reply)
      setSeededFrom(result.suggestionId)
      setWarning(usageWarning ?? '')
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
      setNotice(replyJob.status === 'failed' ? '失敗した返信ジョブを閉じました。' : '返信予約を取り消しました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取り消せませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const handleToggleAutoSend = async () => {
    resetMessages()
    if (!contact) return
    setBusy('autosend')
    try {
      const updated = await setContactAutoSend(contact.id, !contact.autoSendEnabled)
      setNotice(
        updated.autoSendEnabled
          ? 'この相手への自動返信をオンにしました。以後、AIが返信案を作成し、確認・取り消しできる余裕をもって送信予約します。'
          : 'この相手への自動返信をオフにしました。以後は承認してから送信します。',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '自動送信の設定を変更できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const handleExtractSchedule = async () => {
    resetMessages()
    setBusy('schedule')
    try {
      const result = await extractSchedule(item.id)
      const usageWarning = (result as typeof result & { usageWarning?: string }).usageWarning
      setScheduleProposals(result.proposals)
      setAddedProposals(new Set())
      setWarning(usageWarning ?? '')
      if (result.source === 'unavailable') {
        setNotice(result.reason ?? 'AIが未設定のため、予定の抽出は利用できません。')
      } else if (result.proposals.length === 0) {
        setNotice('この会話から追加できそうな予定は見つかりませんでした。')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '予定を抽出できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const handleAddProposal = async (proposal: ScheduleProposal, index: number) => {
    resetMessages()
    setBusy(index)
    try {
      await createCalendarEvent({
        title: proposal.title,
        startsAt: proposal.startsAt,
        endsAt: proposal.endsAt,
        allDay: proposal.allDay,
        location: proposal.location,
        description: proposal.note,
        source: 'extracted',
        inboxItemId: item.id,
        contactId: item.contactId,
      })
      setAddedProposals((prev) => new Set(prev).add(index))
      setNotice('カレンダーに追加しました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'カレンダーに追加できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const canCompose = !replyJob || replyJob.status === 'cancelled'

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">🪄</span>
        <p className="text-sm font-semibold text-violet-800">AIコンシェルジュ</p>
      </div>

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
          {canReply ? 'AIに要約と返信案を作ってもらいましょう。' : 'AIによる要約・返信案はまだありません。'}
        </p>
      )}

      {suggestion && suggestion.assumptions.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-700">AIの推測（確認してください）</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
            {suggestion.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
          </ul>
        </div>
      )}

      {!suggestion && canReply && (
        <button
          onClick={handleGenerate}
          disabled={busy === 'generate'}
          className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy === 'generate' ? '作成中…' : 'AI返信案を作成'}
        </button>
      )}

      {suggestion && canCompose && (
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
            disabled={!canReply}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-stone-50 disabled:text-gray-500"
            placeholder="返信内容を編集できます…"
          />

          {canReply && sendSupported && (
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

          {canReply && isInstagram && (
            <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-gray-500">
              Instagram DMは現在<strong>受信のみ</strong>対応です（送信はMetaのメッセージ送信権限と審査が必要なため、今後対応予定）。要約と返信案の作成まではご利用いただけます。
            </p>
          )}
          {canReply && !sendSupported && !isInstagram && (
            <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-gray-500">
              この媒体への返信送信は現在未対応です（Phase 1で送信できるのはLINEのみです）。
            </p>
          )}
        </div>
      )}

      {replyJob && replyJob.status !== 'cancelled' && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
          <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{replyJob.replyText}</p>

          <div className="mt-3 border-t border-stone-100 pt-3">
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
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-rose-700">✗ 送信失敗{replyErrorText ? `: ${replyErrorText}` : ''}</span>
                  {canReply && sendSupported && (
                    <div className="ml-auto flex items-center gap-2">
                      {!replyResultUnknown && (
                        <button onClick={handleTrigger} disabled={busy === 'trigger'} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50 disabled:opacity-50">
                          再送
                        </button>
                      )}
                      <button onClick={handleCancel} disabled={busy === 'cancel'} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50 disabled:opacity-50">
                        {replyResultUnknown ? '確認後、このジョブを閉じる' : '取り消し'}
                      </button>
                    </div>
                  )}
                </div>
                {replyResultUnknown && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    LINE側では送信済みの可能性があります。二重送信を防ぐため自動再送は停止しています。まずLINEの会話を確認し、届いていなければこのジョブを閉じてから新しい返信として作成してください。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {canManageCalendar && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-gray-600">会話から予定を抽出</p>
            <button
              onClick={handleExtractSchedule}
              disabled={busy === 'schedule'}
              className="rounded-full border border-violet-200 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {busy === 'schedule' ? '抽出中…' : scheduleProposals ? '再抽出' : '予定を抽出'}
            </button>
          </div>

          {scheduleProposals && scheduleProposals.length > 0 && (
            <div className="mt-3 space-y-2">
              {scheduleProposals.map((proposal, index) => (
                <div key={index} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{proposal.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {proposal.allDay ? '終日' : formatJst(proposal.startsAt)}
                        {proposal.endsAt && !proposal.allDay ? ` 〜 ${formatJst(proposal.endsAt)}` : ''}
                        {proposal.location ? `・${proposal.location}` : ''}
                      </p>
                      {proposal.note && <p className="mt-0.5 text-[11px] text-gray-400">{proposal.note}</p>}
                    </div>
                    {addedProposals.has(index) ? (
                      <span className="shrink-0 text-xs text-green-700">✓ 追加済み</span>
                    ) : (
                      <button
                        onClick={() => handleAddProposal(proposal, index)}
                        disabled={busy === index}
                        className="shrink-0 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                      >
                        {busy === index ? '追加中…' : 'カレンダーに追加'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canReply && sendSupported && contact && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-600">この相手への自動返信</p>
            <p className="mt-0.5 text-[11px] leading-5 text-gray-400">
              {contact.autoSendEnabled
                ? 'オン: AIが返信案を作成し、確認・取り消しできる余裕をもって自動で送信予約します。'
                : 'オフ: これまで通り、承認してから送信します。'}
            </p>
          </div>
          <button
            onClick={handleToggleAutoSend}
            disabled={busy === 'autosend'}
            role="switch"
            aria-checked={contact.autoSendEnabled}
            className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${contact.autoSendEnabled ? 'bg-violet-600' : 'bg-stone-300'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${contact.autoSendEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      {warning && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{warning} 続けてAI処理を行う前に、管理者へ使用量台帳の確認を依頼してください。</p>}
      {notice && <p className="mt-3 text-xs text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
    </div>
  )
}