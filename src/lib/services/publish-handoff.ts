import type { DraftRevision, PublishingChannel } from '@/lib/domain/types'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'

export type PublishHandoffRevision = Pick<DraftRevision, 'title' | 'body' | 'hashtags' | 'cta'>

export interface PublishHandoffTarget {
  channel: PublishingChannel
  label: string
  /** Platform-owned page opened in a new tab. */
  url: string
  /** True when the platform URL itself receives the approved text. */
  prefilledText: boolean
  /** Short hint shown after opening the handoff. */
  instruction: string
}

function normalizeHashtag(tag: string): string {
  return tag.trim().replace(/^#+/, '')
}

function hashtagLine(tags: string[]): string {
  return tags
    .map(normalizeHashtag)
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(' ')
}

/**
 * One clipboard representation that remains useful even when a platform
 * cannot accept text through a URL. Media is deliberately not embedded here:
 * the zero-cost flow opens the platform's own composer so the creator can add
 * the original image/video there without needing a paid posting API.
 */
export function formatRevisionForHandoff(
  revision: PublishHandoffRevision,
  channel: PublishingChannel,
): string {
  const parts: string[] = []
  const title = revision.title?.trim()
  const body = revision.body.trim()
  const cta = revision.cta?.trim()
  const hashtags = hashtagLine(revision.hashtags)

  if (channel === 'note' && title) {
    parts.push(`# ${title}`)
  } else if (channel === 'youtube' && title) {
    parts.push(title)
  } else if (title && (channel === 'website' || channel === 'facebook')) {
    parts.push(title)
  }

  if (body) parts.push(body)
  if (cta) parts.push(cta)
  if (hashtags) parts.push(hashtags)

  return parts.filter(Boolean).join('\n\n')
}

/**
 * Returns a platform-owned composer/upload destination for the no-cost handoff.
 * Website is excluded because it is an owned channel, not a third-party SNS.
 * X uses the official Web Intent so text can be pre-populated without an API
 * key or OAuth app; all other destinations receive the same text via clipboard.
 */
export function buildPublishHandoff(
  channel: PublishingChannel,
  text: string,
): PublishHandoffTarget | null {
  const label = PUBLISHING_CHANNEL_CONFIG[channel].label

  switch (channel) {
    case 'x':
      return {
        channel,
        label,
        url: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
        prefilledText: true,
        instruction: '投稿文を入力済みのX作成画面を開きました。内容を確認してポストしてください。',
      }
    case 'instagram':
      return {
        channel,
        label,
        url: 'https://www.instagram.com/',
        prefilledText: false,
        instruction: 'Instagramを開きました。コピー済みの文章をキャプションへ貼り付け、画像・動画を選んで投稿してください。',
      }
    case 'youtube':
      return {
        channel,
        label,
        url: 'https://studio.youtube.com/',
        prefilledText: false,
        instruction: 'YouTube Studioを開きました。コピー済みのタイトル・説明文を使って動画を公開してください。',
      }
    case 'tiktok':
      return {
        channel,
        label,
        url: 'https://www.tiktok.com/upload',
        prefilledText: false,
        instruction: 'TikTokのアップロード画面を開きました。動画を選び、コピー済みの文章を貼り付けて投稿してください。',
      }
    case 'note':
      return {
        channel,
        label,
        url: 'https://note.com/notes/new',
        prefilledText: false,
        instruction: 'noteの新規作成画面を開きました。コピー済みのMarkdownを貼り付けて公開してください。',
      }
    case 'threads':
      return {
        channel,
        label,
        url: 'https://www.threads.com/',
        prefilledText: false,
        instruction: 'Threadsを開きました。コピー済みの文章を貼り付けて投稿してください。',
      }
    case 'facebook':
      return {
        channel,
        label,
        url: 'https://www.facebook.com/',
        prefilledText: false,
        instruction: 'Facebookを開きました。コピー済みの文章を貼り付けて投稿してください。',
      }
    case 'line':
      return {
        channel,
        label,
        url: 'https://manager.line.biz/',
        prefilledText: false,
        instruction: 'LINE Official Account Managerを開きました。コピー済みの文章を使って配信してください。',
      }
    case 'website':
      return null
  }
}
