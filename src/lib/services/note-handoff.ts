import type { DraftRevision } from '@/lib/domain/types'

/** Formats an approved note Revision as Markdown ready to paste into note.com's editor. */
export function formatRevisionForNote(revision: DraftRevision): string {
  const parts: string[] = []

  if (revision.title) parts.push(`# ${revision.title}`)
  parts.push(revision.body.trim())
  if (revision.cta) parts.push(revision.cta.trim())
  if (revision.hashtags.length > 0) parts.push(revision.hashtags.map((tag) => `#${tag}`).join(' '))

  return parts.filter(Boolean).join('\n\n')
}
