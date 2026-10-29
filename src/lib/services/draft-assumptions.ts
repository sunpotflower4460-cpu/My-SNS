/**
 * `assumptions` is only for guessed facts that are not in the Seed or Brand
 * Profile. Copy-editing the creator's own words, channel formatting, and
 * thumbnail/cover hook text are not facts — listing them makes the creator's
 * work look like an unverified AI guess.
 */

const EDITORIAL_NOTE = new RegExp(
  [
    'フック[「『].*[」』].*(?:AI|提案)',
    'サムネイルのフック',
    'thumbnailHook',
    '添削',
    '言い換',
    '原文を.*(?:整|直|短)',
    '媒体向けに',
    'copy-?edit',
    'rephras',
    'adapted (?:the )?wording',
    'shortened (?:the )?(?:title|copy|text|hook)',
    'はAIの提案です',
    'は提案です',
  ].join('|'),
  'i',
)

export function keepFactualAssumptions(entries: string[] | null | undefined): string[] {
  if (!entries) return []
  return entries.filter((entry) => {
    const text = entry.trim()
    if (!text) return false
    return !EDITORIAL_NOTE.test(text)
  })
}
