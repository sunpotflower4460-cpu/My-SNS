import type { DraftRevision, PublishingChannel } from '@/lib/domain/types'
import { formatRevisionForHandoff } from './publish-handoff'

export interface PublishCopyField {
  id: 'title' | 'body' | 'combined'
  label: string
  value: string
}

function bodyWithExtras(revision: Pick<DraftRevision, 'body' | 'cta' | 'hashtags'>): string {
  const parts = [revision.body.trim()]
  const cta = revision.cta?.trim()
  const hashtags = revision.hashtags
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(' ')

  if (cta) parts.push(cta)
  if (hashtags) parts.push(hashtags)
  return parts.filter(Boolean).join('\n\n')
}

export function buildPublishCopyFields(
  revision: Pick<DraftRevision, 'title' | 'body' | 'cta' | 'hashtags'>,
  channel: PublishingChannel,
): PublishCopyField[] {
  const title = revision.title?.trim() ?? ''

  if (channel === 'youtube') {
    return [
      ...(title ? [{ id: 'title' as const, label: 'タイトル', value: title }] : []),
      { id: 'body', label: '説明文', value: bodyWithExtras(revision) },
    ].filter((field) => field.value)
  }

  if (channel === 'note') {
    return [
      ...(title ? [{ id: 'title' as const, label: 'タイトル', value: title }] : []),
      { id: 'body', label: '本文', value: bodyWithExtras(revision) },
    ].filter((field) => field.value)
  }

  return [{
    id: 'combined',
    label: channel === 'instagram' || channel === 'tiktok' ? 'キャプション' : '投稿文',
    value: formatRevisionForHandoff(revision, channel),
  }].filter((field) => field.value)
}
