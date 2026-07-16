import type { PublishingChannel, PublishMode } from '@/lib/domain/types'

export interface PublishingChannelConfig {
  label: string
  shortLabel: string
  icon: string
  delivery: 'api-later' | 'manual-copy' | 'owned-channel'
  description: string
}

export const PUBLISHING_CHANNEL_CONFIG: Record<PublishingChannel, PublishingChannelConfig> = {
  youtube: {
    label: 'YouTube',
    shortLabel: 'YouTube',
    icon: '▶',
    delivery: 'api-later',
    description: 'Video title, description, and supporting copy.',
  },
  note: {
    label: 'note',
    shortLabel: 'note',
    icon: 'n',
    delivery: 'manual-copy',
    description: 'Long-form draft prepared for review and copy.',
  },
  instagram: {
    label: 'Instagram',
    shortLabel: 'Instagram',
    icon: '◎',
    delivery: 'api-later',
    description: 'Caption, tags, and visual framing.',
  },
  x: {
    label: 'X',
    shortLabel: 'X',
    icon: '𝕏',
    delivery: 'api-later',
    description: 'A concise post or thread proposal.',
  },
  tiktok: {
    label: 'TikTok',
    shortLabel: 'TikTok',
    icon: '♪',
    delivery: 'api-later',
    description: 'Short-video caption and hook.',
  },
  threads: {
    label: 'Threads',
    shortLabel: 'Threads',
    icon: '@',
    delivery: 'api-later',
    description: 'Conversational social copy.',
  },
  facebook: {
    label: 'Facebook',
    shortLabel: 'Facebook',
    icon: 'f',
    delivery: 'api-later',
    description: 'Community-oriented post copy.',
  },
  website: {
    label: 'Website',
    shortLabel: 'Website',
    icon: '⌂',
    delivery: 'owned-channel',
    description: 'Copy for the creator-owned home base.',
  },
}

export function isManualCopyChannel(channel: PublishingChannel): boolean {
  return PUBLISHING_CHANNEL_CONFIG[channel].delivery === 'manual-copy'
}

/** The publish_jobs.publish_mode a freshly scheduled job should start in for this channel. */
export function derivePublishMode(channel: PublishingChannel): PublishMode {
  switch (PUBLISHING_CHANNEL_CONFIG[channel].delivery) {
    case 'manual-copy':
      return 'manual'
    case 'owned-channel':
      return 'owned'
    case 'api-later':
      return 'auto'
  }
}
