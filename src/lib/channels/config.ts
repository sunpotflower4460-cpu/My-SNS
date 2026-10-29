import type { PublishingChannel, PublishMode } from '@/lib/domain/types'

export interface PublishingChannelConfig {
  label: string
  shortLabel: string
  icon: string
  delivery: 'api-later' | 'manual-copy' | 'owned-channel'
  description: string
  /**
   * The publish_jobs.publish_mode used when API-first publishing is enabled.
   * Zero-cost mode intentionally overrides this at scheduling time so a new
   * job never calls a paid/review-gated external posting API by surprise.
   */
  mvpPublishMode: PublishMode
}

/**
 * zero-cost is deliberately the default: the app prepares/copies approved
 * content and opens the platform's own composer, while the human presses the
 * final platform-side Publish button. api-first preserves the reviewed OAuth
 * connector behaviour that already exists in the repository.
 */
export type PublishingStrategy = 'zero-cost' | 'api-first'

export const PUBLISHING_CHANNEL_CONFIG: Record<PublishingChannel, PublishingChannelConfig> = {
  youtube: {
    label: 'YouTube',
    shortLabel: 'YouTube',
    icon: '▶',
    delivery: 'api-later',
    description: '動画のタイトル・概要欄・補足コピーを作成します。予約時刻のあと、日次Workerが公開（public）します（Hobbyでは最大約1日のずれ）。急ぎなら「今すぐ公開」。',
    mvpPublishMode: 'auto',
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
    description: 'ショート動画向けのキャプションと冒頭のフックを作成します。監査前はTikTok側がSELF_ONLY（自分のみ）に固定します。',
    mvpPublishMode: 'auto',
  },
  threads: {
    label: 'Threads',
    shortLabel: 'Threads',
    icon: '@',
    delivery: 'api-later',
    description: '会話調のソーシャルコピーを作成します。',
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
  // LINE is a messaging platform (LINE公式アカウント), NOT a publishing channel.
  // It is present here only because PublishingChannel ⊇ SocialPlatform; it is
  // never offered in the Seed channel picker (not in CORE_PUBLISHING_CHANNELS).
  line: {
    label: 'LINE',
    shortLabel: 'LINE',
    icon: 'L',
    delivery: 'manual-copy',
    description: 'LINE公式アカウントのメッセージ（投稿チャンネルではありません）。',
    mvpPublishMode: 'manual',
  },
}

export function isManualCopyChannel(channel: PublishingChannel): boolean {
  return PUBLISHING_CHANNEL_CONFIG[channel].delivery === 'manual-copy'
}

/**
 * Browser-visible, build-time setting. Any unknown/unset value fails safe to
 * zero-cost rather than accidentally enabling an external API call.
 */
export function getPublishingStrategy(value = process.env.NEXT_PUBLIC_PUBLISHING_STRATEGY): PublishingStrategy {
  return value === 'api-first' ? 'api-first' : 'zero-cost'
}

/** The publish_jobs.publish_mode a freshly scheduled job should start in. */
export function derivePublishMode(
  channel: PublishingChannel,
  strategy: PublishingStrategy = getPublishingStrategy(),
): PublishMode {
  if (strategy === 'zero-cost') {
    // Website is creator-owned and has no third-party handoff. Everything else
    // stays human-finalized so the Worker never incurs an external posting cost.
    return channel === 'website' ? 'owned' : 'manual'
  }

  return PUBLISHING_CHANNEL_CONFIG[channel].mvpPublishMode
}
