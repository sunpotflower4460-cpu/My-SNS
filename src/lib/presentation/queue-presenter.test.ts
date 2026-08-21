import { describe, expect, it } from 'vitest'
import {
  describeJobStatus,
  filterAndSortJobs,
  getJobActions,
  isActiveJob,
  publishModeLabel,
} from './queue-presenter'
import type { PublishJob, PublishJobStatus, PublishMode } from '@/lib/domain/types'

function job(over: Partial<PublishJob>): PublishJob {
  return {
    id: 'j1',
    workspaceId: 'w',
    seedId: 's1',
    draftId: 'd1',
    revisionId: 'r1',
    channel: 'x',
    publishMode: 'auto',
    status: 'scheduled',
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

describe('isActiveJob', () => {
  it('treats scheduled/draft/failed as active, others not', () => {
    expect(isActiveJob('scheduled')).toBe(true)
    expect(isActiveJob('draft')).toBe(true)
    expect(isActiveJob('failed')).toBe(true)
    expect(isActiveJob('published')).toBe(false)
    expect(isActiveJob('cancelled')).toBe(false)
  })
})

describe('publishModeLabel', () => {
  it('maps modes to Japanese labels', () => {
    expect(publishModeLabel('auto')).toBe('自動')
    expect(publishModeLabel('assisted')).toBe('要確認')
    expect(publishModeLabel('manual')).toBe('無料ハンドオフ')
  })
})

describe('describeJobStatus', () => {
  it('describes failed / cancelled / published jobs', () => {
    expect(describeJobStatus(job({ status: 'failed' }))).toContain('エラー')
    expect(describeJobStatus(job({ status: 'cancelled' }))).toContain('除外')
    expect(describeJobStatus(job({ status: 'published', publishedAt: '2026-07-20T01:00:00Z' }))).toContain('公開日時:')
    expect(describeJobStatus(job({ status: 'published', publishedAt: undefined }))).toBe('公開済み')
  })

  it('guides a zero-cost manual job through copy/open + completion', () => {
    const line = describeJobStatus(job({
      status: 'draft',
      publishMode: 'manual',
      scheduledAt: '2026-07-20T02:00:00Z',
    }))
    expect(line).toContain('投稿予定:')
    expect(line).toContain('投稿文をコピー')
    expect(line).toContain('投稿済みにする')
  })

  it('keeps API-first assisted/draft and auto scheduling guidance distinct', () => {
    expect(describeJobStatus(job({ status: 'scheduled', publishMode: 'assisted' }))).toContain('API-first')
    expect(describeJobStatus(job({ status: 'draft', publishMode: 'draft' }))).toContain('今すぐ公開')
    expect(describeJobStatus(job({ status: 'scheduled', publishMode: 'auto', scheduledAt: '2026-07-20T02:00:00Z' }))).toContain('予約日時:')
    expect(describeJobStatus(job({ status: 'scheduled', publishMode: 'auto', scheduledAt: undefined }))).toBe('まだ予約されていません')
  })
})

describe('getJobActions', () => {
  it('offers nothing without manage permission', () => {
    const actions = getJobActions(job({ status: 'failed', publishMode: 'auto' }), false)
    expect(Object.values(actions).every((value) => value === false)).toBe(true)
  })

  it('an auto scheduled job can only be cancelled', () => {
    expect(getJobActions(job({ status: 'scheduled', publishMode: 'auto' }), true)).toEqual({
      openHandoff: false,
      publishNow: false,
      completeManually: false,
      retry: false,
      cancel: true,
    })
  })

  it('a failed auto job offers retry + cancel', () => {
    expect(getJobActions(job({ status: 'failed', publishMode: 'auto' }), true)).toEqual({
      openHandoff: false,
      publishNow: false,
      completeManually: false,
      retry: true,
      cancel: true,
    })
  })

  it('an active assisted job offers API-first publish-now, manual-complete, cancel', () => {
    expect(getJobActions(job({ status: 'scheduled', publishMode: 'assisted' }), true)).toEqual({
      openHandoff: false,
      publishNow: true,
      completeManually: true,
      retry: false,
      cancel: true,
    })
  })

  it('an active zero-cost/manual job offers handoff + manual-complete + cancel', () => {
    expect(getJobActions(job({ status: 'draft', channel: 'x', publishMode: 'manual' }), true)).toEqual({
      openHandoff: true,
      publishNow: false,
      completeManually: true,
      retry: false,
      cancel: true,
    })
  })

  it('note uses the same generic zero-cost handoff rather than a one-off copy action', () => {
    expect(getJobActions(job({ status: 'draft', channel: 'note', publishMode: 'manual' }), true).openHandoff).toBe(true)
  })

  it('a published job offers no actions', () => {
    expect(getJobActions(job({ status: 'published', publishMode: 'auto' }), true)).toEqual({
      openHandoff: false,
      publishNow: false,
      completeManually: false,
      retry: false,
      cancel: false,
    })
  })
})

describe('filterAndSortJobs', () => {
  it('filters by status and sorts newest first', () => {
    const jobs = [
      job({ id: 'old', status: 'scheduled', createdAt: '2026-07-18T00:00:00Z' }),
      job({ id: 'new', status: 'scheduled', createdAt: '2026-07-20T00:00:00Z' }),
      job({ id: 'failed', status: 'failed', createdAt: '2026-07-19T00:00:00Z' }),
    ]
    expect(filterAndSortJobs(jobs, 'all').map((entry) => entry.id)).toEqual(['new', 'failed', 'old'])
    expect(filterAndSortJobs(jobs, 'scheduled').map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('does not mutate the input array', () => {
    const jobs = [job({ id: 'a', createdAt: '2026-07-18T00:00:00Z' }), job({ id: 'b', createdAt: '2026-07-20T00:00:00Z' })]
    const snapshot = jobs.map((entry) => entry.id)
    filterAndSortJobs(jobs, 'all')
    expect(jobs.map((entry) => entry.id)).toEqual(snapshot)
  })
})

const _modes: PublishMode[] = ['auto', 'assisted', 'draft', 'manual', 'owned']
const _statuses: PublishJobStatus[] = ['draft', 'scheduled', 'published', 'failed', 'cancelled']
void _modes
void _statuses
