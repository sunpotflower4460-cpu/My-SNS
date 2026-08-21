import { describe, expect, it } from 'vitest'
import type { DraftRevision, PublishJob, Seed } from '@/lib/domain/types'
import { buildPublishPacks } from './publish-pack'

const seed: Seed = {
  id: 'seed-1',
  workspaceId: 'workspace-1',
  title: 'Launch post',
  kind: 'mixed',
  status: 'ready',
  keyPoints: [],
  targetChannels: ['x', 'instagram'],
  tags: [],
  createdBy: 'user-1',
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
}

const revision = (
  id: string,
  channel: 'x' | 'instagram',
  createdAt = '2026-08-21T00:00:00.000Z',
): DraftRevision => ({
  id,
  workspaceId: 'workspace-1',
  seedId: 'seed-1',
  socialDraftId: `draft-${channel}`,
  channel,
  body: `${channel} body ${id}`,
  hashtags: [],
  assumptions: [],
  metadata: {},
  source: 'template',
  approvedBy: 'user-1',
  createdAt,
})

const job = (id: string, channel: 'x' | 'instagram', status: PublishJob['status'], revisionId: string): PublishJob => ({
  id,
  workspaceId: 'workspace-1',
  seedId: 'seed-1',
  draftId: `draft-${channel}`,
  revisionId,
  channel,
  publishMode: 'manual',
  status,
  createdBy: 'user-1',
  createdAt: '2026-08-21T00:00:00.000Z',
})

describe('buildPublishPacks', () => {
  it('shows approved channels before they are added to the queue', () => {
    const packs = buildPublishPacks({ seeds: [seed], jobs: [], revisions: [revision('rev-x', 'x')] })

    expect(packs[0].channels).toEqual([
      expect.objectContaining({ channel: 'x', state: 'approved' }),
      expect.objectContaining({ channel: 'instagram', state: 'missing' }),
    ])
    expect(packs[0].progressPercent).toBe(0)
    expect(packs[0].nextChannel?.channel).toBe('x')
  })

  it('tracks published progress across the whole Seed', () => {
    const revisions = [revision('rev-x', 'x'), revision('rev-instagram', 'instagram')]
    const jobs = [
      job('job-x', 'x', 'published', 'rev-x'),
      job('job-instagram', 'instagram', 'scheduled', 'rev-instagram'),
    ]

    const [pack] = buildPublishPacks({ seeds: [seed], jobs, revisions })

    expect(pack.publishedCount).toBe(1)
    expect(pack.totalCount).toBe(2)
    expect(pack.progressPercent).toBe(50)
    expect(pack.isComplete).toBe(false)
    expect(pack.nextChannel?.channel).toBe('instagram')
    expect(pack.nextChannel?.state).toBe('ready')
  })

  it('makes a cancelled channel resumable with the latest approved revision', () => {
    const oldRevision = revision('rev-x-old', 'x', '2026-08-21T00:00:00.000Z')
    const latestRevision = revision('rev-x-new', 'x', '2026-08-21T01:00:00.000Z')
    const cancelled = job('job-x', 'x', 'cancelled', 'rev-x-old')

    const [pack] = buildPublishPacks({ seeds: [seed], jobs: [cancelled], revisions: [oldRevision, latestRevision] })
    const x = pack.channels.find((item) => item.channel === 'x')

    expect(x).toEqual(expect.objectContaining({
      channel: 'x',
      state: 'approved',
      revision: expect.objectContaining({ id: 'rev-x-new' }),
    }))
    expect(x?.job).toBeUndefined()
  })

  it('marks a pack complete only when every channel is published', () => {
    const revisions = [revision('rev-x', 'x'), revision('rev-instagram', 'instagram')]
    const jobs = [
      job('job-x', 'x', 'published', 'rev-x'),
      job('job-instagram', 'instagram', 'published', 'rev-instagram'),
    ]

    const [pack] = buildPublishPacks({ seeds: [seed], jobs, revisions })

    expect(pack.isComplete).toBe(true)
    expect(pack.progressPercent).toBe(100)
    expect(pack.nextChannel).toBeUndefined()
  })
})
