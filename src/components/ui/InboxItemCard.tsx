import type { InboxItem, InboxNote } from '@/lib/domain/types'
import PlatformBadge from './PlatformBadge'

function cleanHandle(handle: string): string {
  return handle.startsWith('@') ? handle.slice(1) : handle
}

interface InboxItemCardProps {
  item: InboxItem
  notes?: InboxNote[]
  noteDraft?: string
  onChangeNote?: (value: string) => void
  onSaveNote?: () => void
  onToggleRead?: () => void
  onToggleStar?: () => void
  onToggleNeedsAction?: () => void
}

const KIND_LABELS: Record<InboxItem['kind'], string> = {
  dm: '💬 DM',
  comment: '💭 Comment',
  reply: '↩️ Reply',
  mention: '@ Mention',
}

export default function InboxItemCard({ item, notes = [], noteDraft = '', onChangeNote, onSaveNote, onToggleRead, onToggleStar, onToggleNeedsAction }: InboxItemCardProps) {
  return (
    <div className={`rounded-[2rem] border p-5 shadow-sm shadow-stone-100/70 ${item.isRead ? 'border-stone-200 bg-white' : 'border-violet-200 bg-violet-50/40'}`}>
      <div className="flex items-start gap-3">
        <div className="mt-1.5 shrink-0">
          <div className={`h-2.5 w-2.5 rounded-full ${item.isRead ? 'bg-stone-200' : 'bg-violet-500'}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PlatformBadge platform={item.platform} />
            <span className="text-xs text-gray-500">{KIND_LABELS[item.kind]}</span>
            {item.needsAction && <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Needs action</span>}
            {item.isStarred && <span className="text-sm text-yellow-500">★</span>}
          </div>

          <p className="text-sm font-medium text-gray-800">@{cleanHandle(item.authorHandle)}</p>
          <p className="mt-1 text-sm leading-6 text-gray-600">{item.text}</p>
          {item.aiSummary && <p className="mt-2 text-xs italic text-gray-400">AI: {item.aiSummary}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-400">{new Date(item.receivedAt).toLocaleString()}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {onToggleRead && <button onClick={onToggleRead} className="rounded-full border border-stone-200 px-3 py-1 text-gray-600 hover:bg-stone-50 hover:text-gray-900">{item.isRead ? 'Mark unread' : 'Mark read'}</button>}
              {onToggleStar && <button onClick={onToggleStar} className="rounded-full border border-stone-200 px-3 py-1 text-gray-600 hover:bg-stone-50 hover:text-yellow-600">{item.isStarred ? 'Unstar' : 'Star'}</button>}
              {onToggleNeedsAction && <button onClick={onToggleNeedsAction} className="rounded-full border border-stone-200 px-3 py-1 text-gray-600 hover:bg-stone-50 hover:text-gray-900">{item.needsAction ? 'Clear action' : 'Needs action'}</button>}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Notes</p>
              {notes.length > 0 && <span className="text-xs text-gray-400">{notes.length} saved</span>}
            </div>
            {notes.length > 0 && (
              <div className="mt-3 space-y-2">
                {notes.slice(0, 2).map((note) => (
                  <div key={note.id} className="rounded-2xl bg-stone-50 px-3 py-2 text-sm text-gray-600">
                    <p>{note.text}</p>
                    <p className="mt-1 text-xs text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
            {onChangeNote && (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input value={noteDraft} onChange={(event) => onChangeNote(event.target.value)} placeholder="Add a quick internal note…" className="flex-1 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                {onSaveNote && <button onClick={onSaveNote} className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700">Save note</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
