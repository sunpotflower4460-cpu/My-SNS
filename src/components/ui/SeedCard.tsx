import ChannelBadge from '@/components/ui/ChannelBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import type { Seed } from '@/lib/domain/types'

interface SeedCardProps {
  seed: Seed
  onClick?: () => void
}

const KIND_ICONS: Record<Seed['kind'], string> = {
  music: '🎵',
  video: '🎬',
  image: '🖼️',
  text: '✍️',
  mixed: '✨',
}

export default function SeedCard({ seed, onClick }: SeedCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-[2rem] border border-stone-200 bg-white p-5 text-left shadow-sm shadow-stone-100/80 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-50 text-xl">
          {KIND_ICONS[seed.kind]}
        </div>
        <StatusBadge status={seed.status} />
      </div>

      <h2 className="line-clamp-2 text-base font-semibold text-gray-900 group-hover:text-violet-700">
        {seed.title}
      </h2>
      <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-gray-500">
        {seed.sourceText || 'アセットのみのシードです。今すぐ文脈を追加するか、提案ステップで不足点を特定させましょう。'}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {seed.targetChannels.slice(0, 3).map((channel) => (
          <ChannelBadge key={channel} channel={channel} />
        ))}
        {seed.targetChannels.length > 3 && (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">
            +{seed.targetChannels.length - 3}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4 text-xs text-gray-400">
        <span>{seed.brandProfile?.name ?? 'ブランドプロフィール未設定'}</span>
        <span>{new Date(seed.updatedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
      </div>
    </button>
  )
}
