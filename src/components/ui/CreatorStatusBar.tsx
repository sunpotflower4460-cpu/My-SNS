'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app/app-provider'

// Phase 5: the creator picks their current mood/availability. When sharing is on,
// the concierge weaves it into replies only where it genuinely helps (e.g. to set
// expectations about reply speed). Off keeps it private — it never reaches a reply.

const MOODS = ['通常', '忙しい', '落ち着いている', '旅行中', '体調不良', '集中モード'] as const

export default function CreatorStatusBar() {
  const { myCreatorStatus, setMyCreatorStatus } = useApp()

  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState(myCreatorStatus?.mood ?? '通常')
  const [note, setNote] = useState(myCreatorStatus?.note ?? '')
  const [share, setShare] = useState(myCreatorStatus?.shareWithContacts ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const startEdit = () => {
    setMood(myCreatorStatus?.mood ?? '通常')
    setNote(myCreatorStatus?.note ?? '')
    setShare(myCreatorStatus?.shareWithContacts ?? true)
    setError('')
    setOpen(true)
  }

  const handleSave = async () => {
    setError('')
    setBusy(true)
    try {
      await setMyCreatorStatus({ mood, note: note.trim() || undefined, shareWithContacts: share })
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ステータスを保存できませんでした。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">現在のステータス:</span>
          <span className="font-medium text-gray-800">{myCreatorStatus?.mood ?? '未設定'}</span>
          {myCreatorStatus && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${myCreatorStatus.shareWithContacts ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-stone-200 bg-stone-50 text-stone-500'}`}>
              {myCreatorStatus.shareWithContacts ? '相手に伝える' : '非共有'}
            </span>
          )}
        </div>
        {!open && (
          <button onClick={startEdit} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50">
            {myCreatorStatus ? '変更' : '設定する'}
          </button>
        )}
      </div>

      {myCreatorStatus?.note && !open && <p className="mt-1 text-xs text-gray-400">{myCreatorStatus.note}</p>}

      {open && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(m)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${mood === m ? 'bg-violet-600 text-white' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'}`}
              >
                {m}
              </button>
            ))}
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="補足（任意）例: 今週は制作に集中しています"
            className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />

          <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
            必要に応じて相手にも伝える（オフにすると自分用のメモになります）
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button onClick={handleSave} disabled={busy} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {busy ? '保存中…' : '保存'}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-stone-200 px-4 py-2 text-sm text-gray-600 hover:bg-stone-50 disabled:opacity-50">
              キャンセル
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
