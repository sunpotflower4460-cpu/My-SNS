import type { PublishFailureReason } from '@/lib/domain/types'

/** Turns an adapter error message into one of the documented failure buckets. */
export function classifyFailure(message: string): PublishFailureReason {
  const lower = message.toLowerCase()
  if (lower.includes('unavailable')) return 'unavailable'
  if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized')) return 'auth'
  if (lower.includes('rate limit') || lower.includes('429')) return 'ratelimit'
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch failed')) return 'network'
  return 'validation'
}
