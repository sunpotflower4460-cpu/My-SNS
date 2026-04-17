import type { Content } from '@/lib/domain/types'
import StatusBadge from './StatusBadge'

interface ContentCardProps {
  content: Content
  onClick?: () => void
}

const TYPE_ICONS: Record<Content['type'], string> = {
  music: '🎵',
  video: '🎬',
  image: '🖼️',
  text: '📝',
  mixed: '📦',
}

export default function ContentCard({ content, onClick }: ContentCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-gray-200 rounded-xl p-5 ${onClick ? 'cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{TYPE_ICONS[content.type]}</span>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{content.type}</span>
        </div>
        <StatusBadge status={content.status} />
      </div>
      <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2">{content.title}</h3>
      {content.body && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">{content.body}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{content.author?.name ?? 'Unknown'}</span>
        <span>{new Date(content.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
