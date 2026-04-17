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
      className={`rounded-3xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100/80 ${onClick ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md hover:shadow-violet-100/30' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{TYPE_ICONS[content.type]}</span>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{content.type}</span>
        </div>
        <StatusBadge status={content.status} />
      </div>
      <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2">{content.title}</h3>
      {content.body && (
        <p className="mb-4 text-sm leading-6 text-gray-500 line-clamp-2">{content.body}</p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {content.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
            #{tag}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{content.author?.name ?? 'Unknown'}</span>
        <span>{new Date(content.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
