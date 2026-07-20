import type {
  AiGeneration,
  DraftRevision,
  PublishAttempt,
  PublishFailureReason,
  PublishingChannel,
  PublishJob,
} from '@/lib/domain/types'
import { wasRevisionEditedByHuman, WORKSPACE_DRAFT_REVISIONS_LIMIT } from '@/lib/repositories/supabase/draft-revisions'
import { WORKSPACE_PUBLISH_ATTEMPTS_LIMIT } from '@/lib/repositories/supabase/publish-attempts'
import { WORKSPACE_AI_GENERATIONS_LIMIT } from '@/lib/repositories/supabase/ai-generations'

// Pure presenter for the 分析 (Analytics) page (UI-PR5). All the metric math —
// success rate, per-channel breakdown, failure reasons, AI cost, human-edit
// rate, truncation — lives here so it's unit-testable and the page stays a thin
// view. Real records only: nothing here estimates or fabricates. No schema/route
// change.

export interface AnalyticsInput {
  publishAttempts: PublishAttempt[]
  aiGenerations: AiGeneration[]
  draftRevisions: DraftRevision[]
  publishJobs: PublishJob[]
}

export interface ChannelBreakdown {
  channel: PublishingChannel
  success: number
  failed: number
  total: number
  rate: number
}

export interface FailureReasonCount {
  reason: PublishFailureReason
  count: number
}

export interface AnalyticsSummary {
  /** Any capped list is at its limit, so the stats reflect only recent history. */
  isTruncated: boolean
  totalAttempts: number
  successCount: number
  /** null when there are no attempts yet (show "—", not 0%). */
  successRate: number | null
  perChannel: ChannelBreakdown[]
  failureReasons: FailureReasonCount[]
  aiTotals: { totalCost: number; totalCalls: number; totalTokens: number }
  /** edited/total of AI-sourced approved revisions; rate null when total is 0. */
  editStats: { total: number; edited: number; rate: number | null }
}

function percent(part: number, whole: number): number {
  return Math.round((part / whole) * 100)
}

export function computeAnalytics(input: AnalyticsInput): AnalyticsSummary {
  const { publishAttempts, aiGenerations, draftRevisions, publishJobs } = input

  const isTruncated =
    publishAttempts.length >= WORKSPACE_PUBLISH_ATTEMPTS_LIMIT ||
    aiGenerations.length >= WORKSPACE_AI_GENERATIONS_LIMIT ||
    draftRevisions.length >= WORKSPACE_DRAFT_REVISIONS_LIMIT

  const successCount = publishAttempts.filter((attempt) => attempt.status === 'success').length
  const totalAttempts = publishAttempts.length
  const successRate = totalAttempts > 0 ? percent(successCount, totalAttempts) : null

  const channelOf = new Map(publishJobs.map((job) => [job.id, job.channel]))

  const channelCounts = new Map<PublishingChannel, { success: number; failed: number }>()
  const reasonCounts = new Map<PublishFailureReason, number>()
  for (const attempt of publishAttempts) {
    const channel = channelOf.get(attempt.publishJobId)
    if (channel) {
      const entry = channelCounts.get(channel) ?? { success: 0, failed: 0 }
      if (attempt.status === 'success') entry.success += 1
      else entry.failed += 1
      channelCounts.set(channel, entry)
    }
    if (attempt.status === 'failed' && attempt.failureReason) {
      reasonCounts.set(attempt.failureReason, (reasonCounts.get(attempt.failureReason) ?? 0) + 1)
    }
  }

  const perChannel: ChannelBreakdown[] = Array.from(channelCounts.entries())
    .map(([channel, counts]) => {
      const total = counts.success + counts.failed
      return { channel, success: counts.success, failed: counts.failed, total, rate: total > 0 ? percent(counts.success, total) : 0 }
    })
    .sort((left, right) => right.total - left.total)

  const failureReasons: FailureReasonCount[] = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count)

  const aiTotals = aiGenerations.reduce(
    (acc, generation) => ({
      totalCost: acc.totalCost + generation.costUsd,
      totalCalls: acc.totalCalls + 1,
      totalTokens: acc.totalTokens + generation.inputTokens + generation.outputTokens,
    }),
    { totalCost: 0, totalCalls: 0, totalTokens: 0 },
  )

  const withSnapshot = draftRevisions.filter((revision) => revision.source === 'ai' && revision.aiOriginalSnapshot)
  const editedCount = withSnapshot.filter(wasRevisionEditedByHuman).length
  const editStats = {
    total: withSnapshot.length,
    edited: editedCount,
    rate: withSnapshot.length > 0 ? percent(editedCount, withSnapshot.length) : null,
  }

  return { isTruncated, totalAttempts, successCount, successRate, perChannel, failureReasons, aiTotals, editStats }
}

export interface RecentPublishedRow {
  attempt: PublishAttempt
  job: PublishJob
}

/**
 * The most recent successful attempts that carry a real external post id, newest
 * first, joined to their publish job. Attempts whose job is missing are dropped.
 */
export function selectRecentPublished(publishAttempts: PublishAttempt[], publishJobs: PublishJob[], limit = 10): RecentPublishedRow[] {
  const jobById = new Map(publishJobs.map((job) => [job.id, job]))
  return publishAttempts
    .filter((attempt) => attempt.status === 'success' && attempt.externalPostId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit)
    .map((attempt) => ({ attempt, job: jobById.get(attempt.publishJobId) }))
    .filter((row): row is RecentPublishedRow => Boolean(row.job))
}

/** Money formatting for AI cost — honest about a zero/unpriced total. */
export function formatCost(usd: number): string {
  return usd > 0 ? `$${usd.toFixed(usd < 1 ? 4 : 2)}` : '$0（コスト単価未設定）'
}
