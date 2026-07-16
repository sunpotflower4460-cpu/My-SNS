'use client'

import { useEffect, useState } from 'react'
import type { SocialDraft } from '@/lib/domain/types'
import ChannelBadge from './ChannelBadge'
import StatusBadge from './StatusBadge'

function defaultScheduleInputValue(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

interface DraftEditorCardProps {
  draft: SocialDraft
  onEdit?: (id: string, text: string) => void
  onApprove?: (id: string) => void
  onRegenerate?: (id: string) => void
  onSchedule?: (id: string, scheduledAt: string) => void
}

export default function DraftEditorCard({ draft, onEdit, onApprove, onRegenerate, onSchedule }: DraftEditorCardProps) {
  const [text, setText] = useState(draft.draftText)
  const [isDirty, setIsDirty] = useState(false)
  const [scheduleInput, setScheduleInput] = useState(defaultScheduleInputValue)

  useEffect(() => {
    setText(draft.draftText)
    setIsDirty(false)
  }, [draft.draftText, draft.id])

  const handleChange = (val: string) => {
    setText(val)
    setIsDirty(true)
  }

  const handleSave = () => {
    onEdit?.(draft.id, text)
    setIsDirty(false)
  }

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100/70">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ChannelBadge channel={draft.channel} />
        <StatusBadge status={draft.status} />
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.05em] ${draft.source === 'ai' ? 'border border-violet-200 bg-violet-50 text-violet-700' : 'border border-stone-200 bg-stone-50 text-stone-500'}`}>
          {draft.source === 'ai' ? 'AI提案' : 'テンプレート'}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {draft.tone} · {draft.length}
        </span>
      </div>

      {draft.title && <p className="mb-2 text-sm font-semibold text-gray-900">{draft.title}</p>}

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-stone-200 p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
      />

      {draft.hashtags.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">{draft.hashtags.map((tag) => `#${tag}`).join(' ')}</p>
      )}

      {draft.assumptions.length > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold tracking-[0.05em] text-amber-700">確認が必要な前提</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-amber-800">
            {draft.assumptions.map((assumption, index) => <li key={index}>• {assumption}</li>)}
          </ul>
        </div>
      )}

      {onSchedule && draft.status === 'approved' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <label className="text-xs font-medium text-gray-600" htmlFor={`schedule-${draft.id}`}>公開日時</label>
          <input
            id={`schedule-${draft.id}`}
            type="datetime-local"
            value={scheduleInput}
            onChange={(event) => setScheduleInput(event.target.value)}
            className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs"
          />
          <button
            onClick={() => onSchedule(draft.id, new Date(scheduleInput).toISOString())}
            className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
          >
            予約する
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        {isDirty && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.05em] text-amber-700">未保存</span>}
        {isDirty && onEdit && (
          <button
            onClick={handleSave}
            className="rounded-xl bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
          >
            保存
          </button>
        )}
        {onApprove && draft.status === 'draft' && (
          <button
            onClick={() => onApprove(draft.id)}
            className="rounded-xl bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
          >
            承認する
          </button>
        )}
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(draft.id)}
            className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-stone-50"
          >
            テンプレートに戻す
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{text.length}文字</span>
      </div>
    </div>
  )
}
