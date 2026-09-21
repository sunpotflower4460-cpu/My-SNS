import type { SocialPlatform } from '@/lib/domain/types'

/**
 * Time budget for one /api/publish/run invocation (serverless maxDuration).
 *
 * A job that is started must be allowed to finish: killing the function
 * mid-upload leaves a claimed job whose external result is unknown. So the
 * Worker only starts a job when the remaining time covers that job's
 * worst-case duration, and starts at most one long-media job per invocation.
 * Jobs that are not started stay `scheduled` and unclaimed, so the next run
 * (or the Queue「今すぐ公開」) picks them up; claim semantics are unchanged.
 */

/** Platforms whose publish uploads a video/media file and can run for minutes. */
const LONG_MEDIA_PLATFORMS: ReadonlySet<SocialPlatform> = new Set<SocialPlatform>(['youtube', 'tiktok'])

/** YouTube upload timeout is 270s (UPLOAD_TIMEOUT_MS in youtube-connector.ts). */
export const LONG_MEDIA_JOB_WORST_CASE_MS = 270_000

/** A handful of sequential 30s provider calls (X / Instagram / LINE / ...). */
export const SHORT_JOB_WORST_CASE_MS = 90_000

export function isLongMediaChannel(channel: SocialPlatform): boolean {
  return LONG_MEDIA_PLATFORMS.has(channel)
}

export function worstCaseJobDurationMs(channel: SocialPlatform): number {
  return isLongMediaChannel(channel) ? LONG_MEDIA_JOB_WORST_CASE_MS : SHORT_JOB_WORST_CASE_MS
}

export type PublishRunDecision = 'start' | 'defer' | 'stop'

export interface PublishRunBudget {
  /**
   * `start`: run this job. `defer`: leave this job for a later run but keep
   * looking at the remaining ones (a shorter job may still fit). `stop`: no
   * remaining job can fit; end the loop.
   */
  decide(channel: SocialPlatform): PublishRunDecision
  /** Call right before a job is started. */
  markStarted(channel: SocialPlatform): void
}

export function createPublishRunBudget(params: {
  maxDurationMs: number
  now?: () => number
}): PublishRunBudget {
  const now = params.now ?? Date.now
  const deadline = now() + params.maxDurationMs
  let longJobStarted = false

  return {
    decide(channel) {
      const remaining = deadline - now()
      if (remaining < SHORT_JOB_WORST_CASE_MS) return 'stop'
      if (isLongMediaChannel(channel)) {
        if (longJobStarted) return 'defer'
        if (remaining < LONG_MEDIA_JOB_WORST_CASE_MS) return 'defer'
      } else if (remaining < SHORT_JOB_WORST_CASE_MS) {
        return 'stop'
      }
      return 'start'
    },
    markStarted(channel) {
      if (isLongMediaChannel(channel)) longJobStarted = true
    },
  }
}
