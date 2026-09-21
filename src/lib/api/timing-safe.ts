import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison for shared secrets (cron bearer tokens,
 * webhook verify tokens). `===` short-circuits on the first differing byte;
 * timingSafeEqual does not, but it throws on length mismatch, so the length is
 * guarded first (the length of a secret is not itself considered sensitive).
 */
export function timingSafeStringEqual(provided: string | null | undefined, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const providedBuffer = Buffer.from(provided, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (providedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(providedBuffer, expectedBuffer)
}

/** True when the request's Authorization header is exactly `Bearer <secret>`. */
export function isBearerAuthorized(authorizationHeader: string | null, secret: string): boolean {
  return timingSafeStringEqual(authorizationHeader, `Bearer ${secret}`)
}
