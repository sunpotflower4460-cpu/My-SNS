import type { SocialPlatform } from '@/lib/domain/types'

interface PlatformBadgeProps {
  platform: SocialPlatform
}

const PLATFORM_STYLES: Record<SocialPlatform, { label: string; cls: string }> = {
  youtube: { label: 'YouTube', cls: 'bg-red-100 text-red-700 border-red-200' },
  instagram: { label: 'Instagram', cls: 'bg-pink-100 text-pink-700 border-pink-200' },
  threads: { label: 'Threads', cls: 'bg-gray-900 text-white border-gray-800' },
  x: { label: 'X', cls: 'bg-gray-900 text-white border-gray-800' },
  tiktok: { label: 'TikTok', cls: 'bg-gray-900 text-white border-gray-800' },
  facebook: { label: 'Facebook', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
}

export default function PlatformBadge({ platform }: PlatformBadgeProps) {
  const { label, cls } = PLATFORM_STYLES[platform]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}
