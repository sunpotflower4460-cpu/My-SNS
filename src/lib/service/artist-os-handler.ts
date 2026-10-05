import { isBearerAuthorized } from '@/lib/api/timing-safe'
import { buildArtistOsStatus, type ArtistOsStatusReport, type StatusInput } from './artist-os-status'

export interface ServiceEnv {
  token?: string
  workspaceId?: string
  appUrl?: string
}

export type StatusLoader = (workspaceId: string) => Promise<Omit<StatusInput, 'now' | 'appUrl'>>

export type HandlerResult =
  | { status: 200; body: ArtistOsStatusReport }
  | { status: 401 | 502 | 503; body: { error: string } }

/**
 * Fail-closed handler for GET /api/service/v1/status.
 * - 503 when the Artist OS token or the single workspace binding is not configured
 *   (the token is bound to ONE workspace so a bug here cannot leak another tenant).
 * - 401 on a wrong/missing bearer token (constant-time comparison).
 * - 502 with a generic message when the load fails: never echo database errors.
 */
export async function handleArtistOsStatus(
  authorization: string | null,
  env: ServiceEnv,
  load: StatusLoader,
  now: Date = new Date(),
): Promise<HandlerResult> {
  const token = env.token?.trim()
  const workspaceId = env.workspaceId?.trim()
  const appUrl = env.appUrl?.trim()
  if (!token || !workspaceId || !appUrl) {
    return { status: 503, body: { error: 'Artist OS service access is not configured.' } }
  }
  if (!isBearerAuthorized(authorization, token)) {
    return { status: 401, body: { error: 'Not authorized.' } }
  }
  try {
    const data = await load(workspaceId)
    return { status: 200, body: buildArtistOsStatus({ ...data, now, appUrl }) }
  } catch {
    return { status: 502, body: { error: 'Status could not be loaded.' } }
  }
}
