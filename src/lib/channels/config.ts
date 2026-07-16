import type { PublishingChannel, PublishMode } from '@/lib/domain/types'

export interface PublishingChannelConfig {
  label: string
  shortLabel: string
  icon: string
  delivery: 'api-later' | 'manual-copy' | 'owned-channel'
  description: string
  /**
   * The publish_jobs.publish_mode a freshly scheduled job starts in for this
   * channel, per docs/master-plan.md §3's per-platform MVP strategy. Not
   * simply derived from `delivery`: two "api-later" channels intentionally
   * start below auto (YouTube waits for quota/upload review, TikTok starts
   * as an inbox draft) until PR4/PR5 connect a real, audited connector.
   */
  mvpPublishMode: PublishMode
}

export const PUBLISHING_CHANNEL_CONFIG: Record<PublishingChannel, PublishingChannelConfig> = {
  youtube: {
    label: 'YouTube',
    shortLabel: 'YouTube',
    icon: '▶',
    delivery: 'api-later',
    description: 'Video title, description, and supporting copy.',
    mvpPublishMode: 'assisted',
  },
  note: {
    label: 'note',
    shortLabel: 'note',
    icon: 'n',
    delivery: 'manual-copy',
    description: 'Long-form draft prepared for review and copy.',
    mvpPublishMode: 'manual',
  },
  instagram: {
    label: 'Instagram',
    shortLabel: 'Instagram',
    icon: '◎',
    delivery: 'api-later',
    description: 'Caption, tags, and visual framing.',
    mvpPublishMode: 'auto',
  },
  x: {
    label: 'X',
    shortLabel: 'X',
    icon: '𝕏',
    delivery: 'api-later',
    description: 'A concise post or thread proposal.',
    mvpPublishMode: 'auto',
  },
  tiktok: {
    label: 'TikTok',
    shortLabel: 'TikTok',
    icon: '♪',
    delivery: 'api-later',
    description: 'Short-video caption and hook.',
    mvpPublishMode: 'draft',
  },
  threads: {
    label: 'Threads',
    shortLabel: 'Threads',
    icon: '@',
    delivery: 'api-later',
    description: 'Conversational social copy.',
    // Not one of the 5 core MVP channels — master-plan §3 has no explicit
    // strategy for it yet, so default to a human review gate rather than auto.
    mvpPublishMode: 'assisted',
  },
  facebook: {
    label: 'Facebook',
    shortLabel: 'Facebook',
    icon: 'f',
    delivery: 'api-later',
    description: 'Community-oriented post copy.',
    mvpPublishMode: 'assisted',
  },
  website: {
    label: 'Website',
    shortLabel: 'Website',
    icon: '⌂',
    delivery: 'owned-channel',
    description: 'Copy for the creator-owned home base.',
    mvpPublishMode: 'owned',
  },
}

export function isManualCopyChannel(channel: PublishingChannel): boolean {
  return PUBLISHING_CHANNEL_CONFIG[channel].delivery === 'manual-copy'
}

/** The publish_jobs.publish_mode a freshly scheduled job should start in for this channel. */
export function derivePublishMode(channel: PublishingChannel): PublishMode {
  return PUBLISHING_CHANNEL_CONFIG[channel].mvpPublishMode
}
