import { describe, expect, it } from 'vitest'
import type { PublishPack } from './publish-pack'
import { buildTodayPublishingOverview } from './today-publishing'

function pack(overrides: Partial<PublishPack> & Pick<PublishPack, 'seed' | 'channels'>): PublishPack {
  const publishedCount = overrides.channels.filter((item) => item.state === 'published').length
  const totalCount = overrides.channels.length
  return {
    publishedCount,
    totalCount,
    progressPercent: totalCount ? Math.round((publishedCount / totalCount) * 100) : 0,
    isComplete: totalCount > 0 && publishedCount === totalCount,
    nextChannel: overrides.channels.find((item) => item.state !== 'published'),
    ...overrides,
  }
}

const seedBase = {
  workspaceId: 'w',
  title: 'post',
  kind: 'text' as const,
  status: 'ready' as const,
  keyPoints: [],
  targetChannels: ['x'] as const,
  tags: [],
  createdBy: 'u',
  createdAt: '2026-08-20T00:00:00Z',
  updatedAt: '2026-08-20T00:00:00Z',
}

describe('buildTodayPublishingOverview', () => {
  it('treats overdue unfinished jobs as due today', () => {
    const overdue = pack({
      seed: { ...seedBase, id: 'overdue', targetChannels: ['x'] },
      channels: [{
        channel: 'x',
        state: 'ready',
        job: {
          id: 'job', workspaceId: 'w', seedId: 'overdue', draftId: 'd', revisionId: 'r', channel: 'x', publishMode: 'manual', status: 'scheduled', scheduledAt: '2026-08-20T03:00:00Z', createdBy: 'u', createdAt: '2026-08-20T00:00:00Z',
        },
      }],
    })

    const result = buildTodayPublishingOverview([overdue], new Date('2026-08-21T08:00:00+09:00').getTime())
    expect(result.duePacks.map((entry) => entry.seed.id)).toEqual(['overdue'])
  })

  it('does not put future scheduled jobs in today', () => {
    const future = pack({
      seed: { ...seedBase, id: 'future', targetChannels: ['x'] },
      channels: [{
        channel: 'x',
        state: 'ready',
        job: {
          id: 'job', workspaceId: 'w', seedId: 'future', draftId: 'd', revisionId: 'r', channel: 'x', publishMode: 'manual', status: 'scheduled', scheduledAt: '2026-08-22T03:00:00Z', createdBy: 'u', createdAt: '2026-08-20T00:00:00Z',
        },
      }],
    })

    const result = buildTodayPublishingOverview([future], new Date('2026-08-21T08:00:00+09:00').getTime())
    expect(result.duePacks).toHaveLength(0)
    expect(result.activeCount).toBe(1)
  })

  it('prioritizes a failed channel as the next action', () => {
    const ready = pack({
      seed: { ...seedBase, id: 'ready', targetChannels: ['x'] },
      channels: [{ channel: 'x', state: 'ready' }],
    })
    const failed = pack({
      seed: { ...seedBase, id: 'failed', targetChannels: ['instagram'] },
      channels: [{ channel: 'instagram', state: 'failed' }],
    })

    const result = buildTodayPublishingOverview([ready, failed], new Date('2026-08-21T08:00:00+09:00').getTime())
    expect(result.nextPack?.seed.id).toBe('failed')
    expect(result.nextChannel?.channel).toBe('instagram')
  })
})
