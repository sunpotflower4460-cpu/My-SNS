'use client'

import { useEffect, useState } from 'react'
import type { SocialDraft } from '@/lib/domain/types'
import ChannelBadge from './ChannelBadge'
import StatusBadge from './StatusBadge'

interface DraftEditorCardProps {
  draft: SocialDraft
  onEdit?: (id: string, text: string) => void
  onApprove?: (id: string) => void
  onRegenerate?: (id: string) => void
}

export default function DraftEditorCard({ draft, onEdit, onApprove, onRegenerate }: DraftEditorCardProps) {
  const [text, setText] = useState(draft.draftText)
  const [isDirty, setIsDirty] = useState(false)

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
        <span className="text-xs text-gray-400 ml-auto">
          {draft.tone} · {draft.length}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-stone-200 p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
      />

      <div className="flex items-center gap-2 mt-3">
        {isDirty && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Unsaved</span>}
        {isDirty && onEdit && (
          <button
            onClick={handleSave}
            className="rounded-xl bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
          >
            Save
          </button>
        )}
        {onApprove && draft.status === 'draft' && (
          <button
            onClick={() => onApprove(draft.id)}
            className="rounded-xl bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
          >
            Approve
          </button>
        )}
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(draft.id)}
            className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-stone-50"
          >
            Reset template
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{text.length} chars</span>
      </div>
    </div>
  )
}
