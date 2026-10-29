import { describe, expect, it } from 'vitest'
import {
  LONG_MEDIA_JOB_WORST_CASE_MS,
  SHORT_JOB_WORST_CASE_MS,
  createPublishRunBudget,
  worstCaseJobDurationMs,
} from './publish-run-budget'

function clock(startMs = 0) {
  let t = startMs
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

describe('publish run budget', () => {
  it('uses the long worst case for youtube/tiktok only', () => {
    expect(worstCaseJobDurationMs('youtube')).toBe(LONG_MEDIA_JOB_WORST_CASE_MS)
    expect(worstCaseJobDurationMs('tiktok')).toBe(LONG_MEDIA_JOB_WORST_CASE_MS)
    expect(worstCaseJobDurationMs('x')).toBe(SHORT_JOB_WORST_CASE_MS)
  })

  it('starts a long job at the beginning of a 300s run', () => {
    const c = clock()
    const budget = createPublishRunBudget({ maxDurationMs: 300_000, now: c.now })
    expect(budget.decide('youtube')).toBe('start')
  })

  it('allows at most one long-media job per invocation but still runs short ones', () => {
    const c = clock()
    const budget = createPublishRunBudget({ maxDurationMs: 300_000, now: c.now })
    budget.markStarted('youtube')
    c.advance(5_000)
    expect(budget.decide('tiktok')).toBe('defer')
    expect(budget.decide('youtube')).toBe('defer')
    expect(budget.decide('x')).toBe('start')
  })

  it('defers a long job that no longer fits but keeps a short job that does', () => {
    const c = clock()
    const budget = createPublishRunBudget({ maxDurationMs: 300_000, now: c.now })
    c.advance(100_000) // 200s left
    expect(budget.decide('youtube')).toBe('defer')
    expect(budget.decide('instagram')).toBe('start')
  })

  it('stops once even a short job cannot finish', () => {
    const c = clock()
    const budget = createPublishRunBudget({ maxDurationMs: 300_000, now: c.now })
    c.advance(300_000 - SHORT_JOB_WORST_CASE_MS + 1)
    expect(budget.decide('x')).toBe('stop')
    expect(budget.decide('youtube')).toBe('stop')
  })
})
