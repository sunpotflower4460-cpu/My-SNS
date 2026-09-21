/**
 * Compare the configured public URL (NEXT_PUBLIC_APP_URL) with the address the
 * app is actually open at. OAuth redirect URIs are built from the configured
 * URL, so when they differ — a local value left in production, or localhost
 * vs 127.0.0.1 — connecting a social account breaks after the user has already
 * approved it on the platform.
 */
export function detectAppUrlMismatch(
  configured: string | undefined,
  currentOrigin: string | undefined,
): { configured: string; current: string } | null {
  const normalize = (value: string | undefined) => value?.trim().replace(/\/+$/, '') ?? ''
  const expected = normalize(configured)
  const actual = normalize(currentOrigin)
  if (!expected || !actual || expected === actual) return null
  return { configured: expected, current: actual }
}
