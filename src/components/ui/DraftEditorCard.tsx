'use client'

import { useState } from 'react'
import type { SocialDraft } from '@/lib/domain/types'
import PlatformBadge from './PlatformBadge'
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

  const handleChange = (val: string) => {
    setText(val)
    setIsDirty(true)
  }

  const handleSave = () => {
    onEdit?.(draft.id, text)
    setIsDirty(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PlatformBadge platform={draft.platform} />
        <StatusBadge status={draft.status} />
        <span className="text-xs text-gray-400 ml-auto">
          {draft.tone} · {draft.length}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
      />

      <div className="flex items-center gap-2 mt-3">
        {isDirty && onEdit && (
          <button
            onClick={handleSave}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700"
          >
            Save
          </button>
        )}
        {onApprove && draft.status === 'draft' && (
          <button
            onClick={() => onApprove(draft.id)}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
          >
            Approve
          </button>
        )}
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(draft.id)}
            className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Regenerate
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{text.length} chars</span>
      </div>
    </div>
  )
}
