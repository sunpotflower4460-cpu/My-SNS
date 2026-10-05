/**
 * Runtime mode for Artist OS coordination. Explicit configuration, never inferred.
 *   standalone         My-SNS works alone (default; behavior unchanged)
 *   artist_os_managed  Artist OS ownership rules apply: external inbound replies are
 *                      coordinated through the Artist OS Action Ledger and fail closed.
 * Any other non-empty value is treated as managed (most restrictive wins) and flagged invalid.
 */
export type ArtistOsMode = 'standalone' | 'artist_os_managed'

export interface ModeResolution {
  mode: ArtistOsMode
  modeInvalid: boolean
}

export function resolveArtistOsMode(env: Record<string, string | undefined> = process.env): ModeResolution {
  const raw = env.ARTIST_OS_MODE?.trim()
  if (!raw || raw === 'standalone') return { mode: 'standalone', modeInvalid: false }
  if (raw === 'artist_os_managed') return { mode: 'artist_os_managed', modeInvalid: false }
  return { mode: 'artist_os_managed', modeInvalid: true }
}
