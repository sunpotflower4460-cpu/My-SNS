// Pure helpers for the ブランドプロフィール page (UI-PR10). Small but real: the
// list normalisation (how a textarea becomes a deduped string[]) and the save
// validation are the only logic on the page, so they're extracted here and
// unit-tested. No schema/route change.

/**
 * Turn a free-text field (newline- or comma-separated) into a trimmed, de-duped,
 * empty-free list — the shape the Brand Profile stores for traits/values/terms.
 */
export function normalizeBrandList(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)))
}

export type BrandValidation = { ok: true } | { ok: false; error: string }

/** Validate the required Brand Profile fields before saving. Same messages/order as before. */
export function validateBrandProfile(input: { name: string; language: string }): BrandValidation {
  if (!input.name.trim()) return { ok: false, error: 'ブランドプロフィール名を入力してください。' }
  if (!input.language.trim()) return { ok: false, error: 'AI提案に使う言語を入力してください。' }
  return { ok: true }
}
