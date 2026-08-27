'use client'

import { useEffect, useState } from 'react'
import type { SocialDraft } from '@/lib/domain/types'
import ChannelBadge from './ChannelBadge'
import StatusBadge from './StatusBadge'

function clientScheduleInputValue(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

interface DraftEditorCardProps {
  draft: SocialDraft
  onEdit?: (id: string, text: string) => void
  /** Receives the editor's current text so approve never freezes a stale saved copy. */
  onApprove?: (id: string, text: string) => void
  onRegenerate?: (id: string) => void
  onSchedule?: (id: string, scheduledAt: string) => void
}

export default function DraftEditorCard({ draft, onEdit, onApprove, onRegenerate, onSchedule }: DraftEditorCardProps) {
  const [text, setText] = useState(draft.draftText)
  const [isDirty, setIsDirty] = useState(false)
  // datetime-local defaults must be client-only: SSR often runs in UTC while the
  // browser uses Asia/Tokyo, which would hydrate with a mismatched value.
  const [scheduleInput, setScheduleInput] = useState('')

  useEffect(() => {
    setText(draft.draftText)
    setIsDirty(false)
  }, [draft.draftText, draft.id])

  useEffect(() => {
    setScheduleInput(clientScheduleInputValue())
  }, [draft.id])

  const handleChange = (val: string) => {
    setText(val)
    setIsDirty(true)
  }

  const handleSave = () => {
    // Keep isDirty until draft.draftText catches up via parent refresh.
    // Clearing it eagerly would re-enable 予約する against a stale Revision
    // if persistDraft fails.
    onEdit?.(draft.id, text)
  }

  const handleApprove = () => {
    // Keep isDirty until the parent confirms via an updated draft prop.
    // Clearing it eagerly would hide "未保存" if approval fails.
    onApprove?.(draft.id, text)
  }

  const handleSchedule = () => {
    if (isDirty || !scheduleInput) return
    onSchedule?.(draft.id, new Date(scheduleInput).toISOString())
  }

  return (
    <div className="ui-panel rounded-container p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ChannelBadge channel={draft.channel} />
        <StatusBadge status={draft.status} />
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${draft.source === 'ai' ? 'border border-[color:rgba(109,93,246,0.16)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'border border-[color:var(--border-default)] bg-black/[0.03] text-[color:var(--text-muted)]'}`}>
          {draft.source === 'ai' ? 'AI提案' : 'テンプレート'}
        </span>
        <span className="ml-auto text-xs text-[color:var(--text-subtle)]">
          {draft.tone} · {draft.length}
        </span>
      </div>

      {draft.title && <p className="mb-2 text-sm font-semibold text-[color:var(--text-strong)]">{draft.title}</p>}

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        className="ui-input w-full resize-none rounded-card p-3 text-sm text-[color:var(--text-default)] focus:outline-none"
      />

      {draft.hashtags.length > 0 && (
        <p className="mt-2 text-xs text-[color:var(--text-subtle)]">{draft.hashtags.map((tag) => `#${tag}`).join(' ')}</p>
      )}

      {draft.assumptions.length > 0 && (
        <div className="mt-3 rounded-card border border-amber-200/80 bg-amber-50/90 p-3">
          <p className="text-[11px] font-semibold text-amber-700">確認が必要な前提</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-amber-800">
            {draft.assumptions.map((assumption, index) => <li key={index}>• {assumption}</li>)}
          </ul>
        </div>
      )}

      {onSchedule && draft.status === 'approved' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-[color:var(--border-default)] bg-black/[0.025] p-3">
          <label className="text-xs font-medium text-[color:var(--text-default)]" htmlFor={`schedule-${draft.id}`}>公開日時</label>
          <input
            id={`schedule-${draft.id}`}
            type="datetime-local"
            value={scheduleInput}
            onChange={(event) => setScheduleInput(event.target.value)}
            className="ui-input rounded-control px-2.5 py-1.5 text-xs focus:outline-none"
          />
          <button
            onClick={handleSchedule}
            disabled={isDirty || !scheduleInput}
            title={isDirty ? '未保存の編集があります。先に保存してから再承認してください。予約は直近の承認版を使います。' : undefined}
            className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition duration-200 ease-[var(--ease-out-premium)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            予約する
          </button>
          {isDirty && (
            <p className="basis-full text-[11px] text-amber-700">
              未保存の編集があります。予約は直近の承認版を使うため、先に保存して再承認してください。
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {isDirty && <span className="rounded-full border border-amber-200/80 bg-amber-50/90 px-2.5 py-1 text-[11px] font-semibold text-amber-700">未保存</span>}
        {isDirty && onEdit && (
          <button
            onClick={handleSave}
            className="rounded-full bg-[color:var(--text-strong)] px-3 py-1.5 text-xs text-white transition duration-200 ease-[var(--ease-out-premium)] hover:opacity-90"
          >
            保存
          </button>
        )}
        {onApprove && draft.status === 'draft' && (
          <button
            onClick={handleApprove}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs text-white transition duration-200 ease-[var(--ease-out-premium)] hover:bg-emerald-700"
          >
            承認する
          </button>
        )}
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(draft.id)}
            className="rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-xs text-[color:var(--text-muted)] transition duration-200 ease-[var(--ease-out-premium)] hover:bg-white hover:text-[color:var(--text-strong)]"
          >
            テンプレートに戻す
          </button>
        )}
        <span className="ml-auto text-xs text-[color:var(--text-subtle)]">{text.length}文字</span>
      </div>
    </div>
  )
}
