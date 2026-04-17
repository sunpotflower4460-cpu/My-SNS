import type { InboxItem } from '@/lib/domain/types'
import PlatformBadge from './PlatformBadge'

/** Normalise a social handle by stripping any leading '@'. */
function cleanHandle(handle: string): string {
  return handle.startsWith('@') ? handle.slice(1) : handle
}

interface InboxItemCardProps {
  item: InboxItem
  onMarkRead?: (id: string) => void
  onStar?: (id: string) => void
  onOpenNote?: (id: string) => void
}

const KIND_LABELS: Record<InboxItem['kind'], string> = {
  dm: '💬 DM',
  comment: '💭 Comment',
  reply: '↩️ Reply',
  mention: '@ Mention',
}

export default function InboxItemCard({ item, onMarkRead, onStar, onOpenNote }: InboxItemCardProps) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${item.isRead ? 'border-gray-200' : 'border-violet-200 bg-violet-50/30'}`}>
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <div className="mt-1.5 shrink-0">
          {!item.isRead && <div className="w-2 h-2 rounded-full bg-violet-500" />}
          {item.isRead && <div className="w-2 h-2 rounded-full bg-transparent" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <PlatformBadge platform={item.platform} />
            <span className="text-xs text-gray-500">{KIND_LABELS[item.kind]}</span>
            {item.needsAction && (
              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">Needs action</span>
            )}
            {item.isStarred && <span className="text-yellow-500 text-sm">★</span>}
          </div>

          <p className="text-sm font-medium text-gray-800">@{cleanHandle(item.authorHandle)}</p>
          <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.text}</p>

          {item.aiSummary && (
            <p className="mt-1.5 text-xs text-gray-400 italic">AI: {item.aiSummary}</p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-gray-400">
              {new Date(item.receivedAt).toLocaleString()}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              {onMarkRead && !item.isRead && (
                <button
                  onClick={() => onMarkRead(item.id)}
                  className="text-xs text-violet-600 hover:text-violet-800"
                >
                  Mark read
                </button>
              )}
              {onStar && (
                <button
                  onClick={() => onStar(item.id)}
                  className="text-xs text-gray-500 hover:text-yellow-500"
                >
                  {item.isStarred ? 'Unstar' : 'Star'}
                </button>
              )}
              {onOpenNote && (
                <button
                  onClick={() => onOpenNote(item.id)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Note
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
