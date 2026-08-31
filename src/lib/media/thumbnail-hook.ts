/**
 * YouTube-CTR hook copy: 3–8 huge characters, never a paragraph.
 * Used as overlay text on a real still. `thumbnailTextIdeas` strings are not
 * thumbnails and must not reach this helper.
 */

const WRAPPERS = /[「」『』【】\[\]()（）""'']/g
const CLAUSE_SPLIT = /[。！？!?．.、,]/
const TRAILING_PARTICLES = /[はがをにてのとへもや]$/u

export const THUMBNAIL_HOOK_MIN = 3
export const THUMBNAIL_HOOK_MAX = 8

export function countGraphemes(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].length
  }
  return Array.from(text).length
}

export function takeGraphemes(text: string, limit: number): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)]
      .slice(0, limit)
      .map((part) => part.segment)
      .join('')
  }
  return Array.from(text).slice(0, limit).join('')
}

export function isValidThumbnailHook(text: string): boolean {
  const normalized = text.replace(/\s+/g, '').trim()
  if (!normalized) return false
  if (/[\n\r]/.test(text)) return false
  if (CLAUSE_SPLIT.test(normalized) && countGraphemes(normalized) > THUMBNAIL_HOOK_MAX) return false
  const length = countGraphemes(normalized)
  return length >= THUMBNAIL_HOOK_MIN && length <= THUMBNAIL_HOOK_MAX
}

function firstClause(text: string): string {
  const stripped = text.replace(WRAPPERS, ' ').replace(/\s+/g, ' ').trim()
  const clause = stripped.split(CLAUSE_SPLIT)[0]?.trim() ?? stripped
  return clause.replace(/\s+/g, '')
}

export function shortenThumbnailHook(text: string | null | undefined): string {
  if (!text) return ''
  const clause = firstClause(text)
  if (!clause) return ''

  let candidate = clause
  while (countGraphemes(candidate) > THUMBNAIL_HOOK_MAX) {
    candidate = takeGraphemes(candidate, countGraphemes(candidate) - 1).replace(TRAILING_PARTICLES, '')
  }
  while (countGraphemes(candidate) > THUMBNAIL_HOOK_MIN && TRAILING_PARTICLES.test(candidate)) {
    candidate = candidate.replace(TRAILING_PARTICLES, '')
  }

  if (countGraphemes(candidate) > THUMBNAIL_HOOK_MAX) {
    candidate = takeGraphemes(candidate, THUMBNAIL_HOOK_MAX)
  }

  return isValidThumbnailHook(candidate) ? candidate : ''
}

export type ThumbnailHookSource = 'proposal' | 'title' | 'seed'

export interface ResolvedThumbnailHook {
  hook: string
  source: ThumbnailHookSource
}

/**
 * Prefer a 3–8 character overlay when it is actually that short.
 * Paragraph-shaped `thumbnailTextIdeas` never qualify.
 * Overlay copy is not an assumption — even when condensed from a proposal.
 */
export function resolveThumbnailHook(params: {
  proposed?: string | null
  title?: string | null
  seedTitle?: string | null
}): ResolvedThumbnailHook {
  const proposed = params.proposed?.trim() ?? ''
  if (isValidThumbnailHook(proposed)) {
    return {
      hook: proposed.replace(/\s+/g, ''),
      source: 'proposal',
    }
  }

  const proposedGraphemes = countGraphemes(proposed.replace(/\s+/g, ''))
  const looksLikeParagraph = proposed.includes(' ') || proposedGraphemes > 16
  if (proposed && !looksLikeParagraph) {
    const fromProposed = shortenThumbnailHook(proposed)
    if (fromProposed) {
      return {
        hook: fromProposed,
        source: 'proposal',
      }
    }
  }

  const fromTitle = shortenThumbnailHook(params.title)
  if (fromTitle) return { hook: fromTitle, source: 'title' }

  const fromSeed = shortenThumbnailHook(params.seedTitle)
  if (fromSeed) return { hook: fromSeed, source: 'seed' }

  return { hook: '', source: 'seed' }
}
