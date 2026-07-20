import { describe, expect, it } from 'vitest'
import { computeAnalytics, formatCost, selectRecentPublished, type AnalyticsInput } from './analytics-presenter'
import type { AiGeneration, DraftRevision, PublishAttempt, PublishJob } from '@/lib/domain/types'

function attempt(over: Partial<PublishAttempt>): PublishAttempt {
  return {
    id: 'at1',
    workspaceId: 'w',
    publishJobId: 'j1',
    attemptNumber: 1,
    status: 'success',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function job(over: Partial<PublishJob>): PublishJob {
  return {
    id: 'j1',
    workspaceId: 'w',
    seedId: 's1',
    draftId: 'd1',
    revisionId: 'r1',
    channel: 'x',
    publishMode: 'auto',
    status: 'published',
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function generation(over: Partial<AiGeneration>): AiGeneration {
  return {
    id: 'g1',
    workspaceId: 'w',
    purpose: 'draft',
    channels: ['x'],
    model: 'claude',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function revision(over: Partial<DraftRevision>): DraftRevision {
  return {
    id: 'rev1',
    workspaceId: 'w',
    seedId: 's1',
    socialDraftId: 'd1',
    channel: 'x',
    body: 'body',
    hashtags: [],
    assumptions: [],
    metadata: {},
    source: 'ai',
    approvedBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function emptyInput(over: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return { publishAttempts: [], aiGenerations: [], draftRevisions: [], publishJobs: [], ...over }
}

describe('computeAnalytics', () => {
  it('reports null success rate for zero attempts, not 0%', () => {
    const s = computeAnalytics(emptyInput())
    expect(s.successRate).toBeNull()
    expect(s.totalAttempts).toBe(0)
    expect(s.editStats.rate).toBeNull()
  })

  it('computes success rate and per-channel breakdown, sorted by volume', () => {
    const jobs = [job({ id: 'jx', channel: 'x' }), job({ id: 'jn', channel: 'note' })]
    const attempts = [
      attempt({ id: 'a1', publishJobId: 'jx', status: 'success' }),
      attempt({ id: 'a2', publishJobId: 'jx', status: 'failed', failureReason: 'auth' }),
      attempt({ id: 'a3', publishJobId: 'jn', status: 'success' }),
      attempt({ id: 'a4', publishJobId: 'jx', status: 'success' }),
    ]
    const s = computeAnalytics(emptyInput({ publishAttempts: attempts, publishJobs: jobs }))
    expect(s.totalAttempts).toBe(4)
    expect(s.successCount).toBe(3)
    expect(s.successRate).toBe(75)
    // x has 3 attempts, note has 1 → x first
    expect(s.perChannel.map((c) => c.channel)).toEqual(['x', 'note'])
    expect(s.perChannel[0]).toMatchObject({ channel: 'x', success: 2, failed: 1, total: 3, rate: 67 })
  })

  it('aggregates failure reasons, most frequent first', () => {
    const jobs = [job({ id: 'jx' })]
    const attempts = [
      attempt({ id: 'a1', publishJobId: 'jx', status: 'failed', failureReason: 'network' }),
      attempt({ id: 'a2', publishJobId: 'jx', status: 'failed', failureReason: 'auth' }),
      attempt({ id: 'a3', publishJobId: 'jx', status: 'failed', failureReason: 'auth' }),
    ]
    const s = computeAnalytics(emptyInput({ publishAttempts: attempts, publishJobs: jobs }))
    expect(s.failureReasons).toEqual([
      { reason: 'auth', count: 2 },
      { reason: 'network', count: 1 },
    ])
  })

  it('ignores attempts whose job is not loaded (no channel)', () => {
    const s = computeAnalytics(emptyInput({ publishAttempts: [attempt({ publishJobId: 'missing' })], publishJobs: [] }))
    expect(s.perChannel).toEqual([])
    // still counts toward overall totals
    expect(s.totalAttempts).toBe(1)
  })

  it('sums AI cost, calls and tokens', () => {
    const s = computeAnalytics(emptyInput({ aiGenerations: [generation({ costUsd: 0.02, inputTokens: 100, outputTokens: 50 }), generation({ id: 'g2', costUsd: 0.03, inputTokens: 10, outputTokens: 5 })] }))
    expect(s.aiTotals.totalCalls).toBe(2)
    expect(s.aiTotals.totalTokens).toBe(165)
    expect(s.aiTotals.totalCost).toBeCloseTo(0.05, 5)
  })

  it('computes human-edit rate over AI revisions that carry a snapshot', () => {
    const revisions = [
      // edited: body differs from snapshot
      revision({ id: 'edited', body: 'new body', aiOriginalSnapshot: { body: 'old body', hashtags: [] } }),
      // unchanged
      revision({ id: 'same', body: 'same', aiOriginalSnapshot: { body: 'same', hashtags: [] } }),
      // no snapshot → excluded from the denominator
      revision({ id: 'nosnap', body: 'x' }),
      // template-sourced → excluded
      revision({ id: 'tmpl', source: 'template', body: 'y', aiOriginalSnapshot: { body: 'z', hashtags: [] } }),
    ]
    const s = computeAnalytics(emptyInput({ draftRevisions: revisions }))
    expect(s.editStats).toEqual({ total: 2, edited: 1, rate: 50 })
  })
})

describe('selectRecentPublished', () => {
  it('keeps only successful attempts with an external post id, newest first', () => {
    const jobs = [job({ id: 'jx' })]
    const attempts = [
      attempt({ id: 'old', publishJobId: 'jx', status: 'success', externalPostId: 'p1', createdAt: '2026-07-18T00:00:00Z' }),
      attempt({ id: 'new', publishJobId: 'jx', status: 'success', externalPostId: 'p2', createdAt: '2026-07-20T00:00:00Z' }),
      attempt({ id: 'noext', publishJobId: 'jx', status: 'success' }),
      attempt({ id: 'failed', publishJobId: 'jx', status: 'failed', externalPostId: 'p3' }),
    ]
    const rows = selectRecentPublished(attempts, jobs)
    expect(rows.map((r) => r.attempt.id)).toEqual(['new', 'old'])
  })

  it('drops rows whose job is missing and respects the limit', () => {
    const attempts = Array.from({ length: 12 }, (_, i) =>
      attempt({ id: `a${i}`, publishJobId: 'jx', status: 'success', externalPostId: `p${i}`, createdAt: `2026-07-${10 + i}T00:00:00Z` }),
    )
    expect(selectRecentPublished(attempts, [], 10)).toHaveLength(0) // no job loaded
    expect(selectRecentPublished(attempts, [job({ id: 'jx' })], 10)).toHaveLength(10)
  })
})

describe('formatCost', () => {
  it('is honest about a zero total', () => {
    expect(formatCost(0)).toContain('未設定')
  })
  it('uses 4 decimals under $1 and 2 above', () => {
    expect(formatCost(0.0123)).toBe('$0.0123')
    expect(formatCost(12.5)).toBe('$12.50')
  })
})
