import type { SocialDraft } from '@/lib/domain/types'

type DraftWords = Pick<SocialDraft, 'draftText' | 'title' | 'cta' | 'hashtags'>

/**
 * True when the words of a draft differ from the saved copy. Metadata (account
 * choice, cover asset, …) is deliberately not part of this: those edits do not
 * make an approved Revision stale, but a wording change does.
 */
export function hasDraftContentChanged(saved: DraftWords, next: DraftWords): boolean {
  return (
    saved.draftText !== next.draftText ||
    (saved.title ?? '') !== (next.title ?? '') ||
    (saved.cta ?? '') !== (next.cta ?? '') ||
    saved.hashtags.join(' ') !== next.hashtags.join(' ')
  )
}
