import { isBearerAuthorized } from '@/lib/api/timing-safe'
import { buildInboundEvents } from './artist-os-inbound'
import { buildArtistOsStatus, type ArtistOsStatusReport, type StatusInput } from './artist-os-status'

export interface ServiceEnv {
  token?: string
  /** Optional second credential accepted ONLY by the inbound-events route (least privilege for relationship intelligence). */
  inboundReadToken?: string
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

export type InboundLoader = (workspaceId: string) => Promise<{ rows: import('./artist-os-inbound').InboxRow[]; replyJobs: import('./artist-os-inbound').ReplyJobRef[] }>

/** Same fail-closed gate as the status handler, for GET /api/service/v1/inbound-events. */
export async function handleArtistOsInbound(
  authorization: string | null,
  env: ServiceEnv,
  load: InboundLoader,
  now: Date = new Date(),
): Promise<{ status: 200; body: ReturnType<typeof buildInboundEvents> } | { status: 401 | 502 | 503; body: { error: string } }> {
  const tokens = [env.token?.trim(), env.inboundReadToken?.trim()].filter((t): t is string => Boolean(t))
  const workspaceId = env.workspaceId?.trim()
  if (tokens.length === 0 || !workspaceId) return { status: 503, body: { error: 'Artist OS service access is not configured.' } }
  // Evaluate every candidate (no early exit on the first match) so timing does not reveal which token matched.
  const authorized = tokens.map((t) => isBearerAuthorized(authorization, t)).some(Boolean)
  if (!authorized) return { status: 401, body: { error: 'Not authorized.' } }
  try {
    return { status: 200, body: buildInboundEvents({ now, ...(await load(workspaceId)) }) }
  } catch {
    return { status: 502, body: { error: 'Inbound events could not be loaded.' } }
  }
}
