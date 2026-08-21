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

  if (channel === 'youtube' || channel === 'note') {
    const fields: PublishCopyField[] = []
    if (title) fields.push({ id: 'title', label: 'タイトル', value: title })

    const body = bodyWithExtras(revision)
    if (body) {
      fields.push({
        id: 'body',
        label: channel === 'youtube' ? '説明文' : '本文',
        value: body,
      })
    }
    return fields
  }

  const combined = formatRevisionForHandoff(revision, channel)
  if (!combined) return []

  return [{
    id: 'combined',
    label: channel === 'instagram' || channel === 'tiktok' ? 'キャプション' : '投稿文',
    value: combined,
  }]
}
