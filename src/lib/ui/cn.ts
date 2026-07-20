/**
 * Tiny class-name combiner: joins truthy class strings with a space. Deliberately
 * dependency-free (no clsx/tailwind-merge) — the design-system components pass a
 * fixed base plus an optional caller `className`, and later classes win in the
 * cascade for the utilities we use, which is all we need here.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
