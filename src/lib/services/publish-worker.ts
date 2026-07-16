import type { PublishFailureReason } from '@/lib/domain/types'

// The stub connector's exact wording (see UnavailableSocialConnectorAdapter).
// Checked as a specific phrase, not a bare "unavailable" substring — a real
// future adapter's transient "503 Service Unavailable" should classify as
// network (retryable), not this "connector isn't configured yet" bucket.
const CONNECTOR_NOT_READY_PHRASE = 'unavailable until the reviewed platform connector phase'

/** Turns an adapter error message into one of the documented failure buckets. */
export function classifyFailure(message: string): PublishFailureReason {
  const lower = message.toLowerCase()
  if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized')) return 'auth'
  if (lower.includes('rate limit') || lower.includes('429')) return 'ratelimit'
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch failed')) return 'network'
  if (lower.includes(CONNECTOR_NOT_READY_PHRASE)) return 'unavailable'
  return 'validation'
}
