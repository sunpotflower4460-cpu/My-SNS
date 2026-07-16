import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { PublishingChannel } from '@/lib/domain/types'

const CHANNEL_STYLES: Record<PublishingChannel, string> = {
  youtube: 'border-red-200 bg-red-50 text-red-700',
  note: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  instagram: 'border-pink-200 bg-pink-50 text-pink-700',
  x: 'border-slate-200 bg-slate-50 text-slate-700',
  tiktok: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  threads: 'border-gray-200 bg-gray-50 text-gray-700',
  facebook: 'border-blue-200 bg-blue-50 text-blue-700',
  website: 'border-violet-200 bg-violet-50 text-violet-700',
}

export default function ChannelBadge({ channel }: { channel: PublishingChannel }) {
  const config = PUBLISHING_CHANNEL_CONFIG[channel]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHANNEL_STYLES[channel]}`}>
      <span aria-hidden>{config.icon}</span>
      {config.shortLabel}
    </span>
  )
}
