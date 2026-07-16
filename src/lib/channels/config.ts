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
    description: '動画のタイトル・概要欄・補足コピーを作成します。',
    mvpPublishMode: 'assisted',
  },
  note: {
    label: 'note',
    shortLabel: 'note',
    icon: 'n',
    delivery: 'manual-copy',
    description: '確認してコピーするための、長文向けの下書きを作成します。',
    mvpPublishMode: 'manual',
  },
  instagram: {
    label: 'Instagram',
    shortLabel: 'Instagram',
    icon: '◎',
    delivery: 'api-later',
    description: 'キャプション・タグ・見せ方の構成を作成します。',
    mvpPublishMode: 'auto',
  },
  x: {
    label: 'X',
    shortLabel: 'X',
    icon: '𝕏',
    delivery: 'api-later',
    description: '簡潔な投稿、またはスレッド形式の案を作成します。',
    mvpPublishMode: 'auto',
  },
  tiktok: {
    label: 'TikTok',
    shortLabel: 'TikTok',
    icon: '♪',
    delivery: 'api-later',
    description: 'ショート動画向けのキャプションと冒頭のフックを作成します。',
    mvpPublishMode: 'draft',
  },
  threads: {
    label: 'Threads',
    shortLabel: 'Threads',
    icon: '@',
    delivery: 'api-later',
    description: '会話調のソーシャルコピーを作成します。',
    // Not one of the 5 core MVP channels — master-plan §3 has no explicit
    // strategy for it yet, so default to a human review gate rather than auto.
    mvpPublishMode: 'assisted',
  },
  facebook: {
    label: 'Facebook',
    shortLabel: 'Facebook',
    icon: 'f',
    delivery: 'api-later',
    description: 'コミュニティ向けの投稿コピーを作成します。',
    mvpPublishMode: 'assisted',
  },
  website: {
    label: 'Website',
    shortLabel: 'Website',
    icon: '⌂',
    delivery: 'owned-channel',
    description: 'クリエイター自身のサイト向けのコピーを作成します。',
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
