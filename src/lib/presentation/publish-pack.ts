import type { DraftRevision, PublishJob, PublishingChannel, Seed } from '@/lib/domain/types'

export type PublishPackChannelState = 'missing' | 'approved' | 'ready' | 'failed' | 'cancelled' | 'published'

export interface PublishPackChannelItem {
  channel: PublishingChannel
  revision?: DraftRevision
  job?: PublishJob
  state: PublishPackChannelState
}

export interface PublishPack {
  seed: Seed
  channels: PublishPackChannelItem[]
  publishedCount: number
  totalCount: number
  progressPercent: number
  isComplete: boolean
  nextChannel?: PublishPackChannelItem
}

function newestByCreatedAt<T extends { createdAt: string }>(items: T[]): T | undefined {
  return items
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]
}

function getChannelState(job?: PublishJob, revision?: DraftRevision): PublishPackChannelState {
  if (!job) return revision ? 'approved' : 'missing'
  if (job.status === 'published') return 'published'
  if (job.status === 'failed') return 'failed'
  if (job.status === 'cancelled') return 'cancelled'
  return 'ready'
}

export function buildPublishPacks(params: {
  seeds: Seed[]
  jobs: PublishJob[]
  revisions: DraftRevision[]
}): PublishPack[] {
  const { seeds, jobs, revisions } = params

  return seeds
    .filter((seed) => seed.targetChannels.length > 0)
    .map((seed) => {
      const seedJobs = jobs.filter((job) => job.seedId === seed.id)
      const seedRevisions = revisions.filter((revision) => revision.seedId === seed.id)

      // A pack reflects what the Seed targets now. Historical jobs and revisions
      // for a channel that was later removed remain in audit/history, but do not
      // inflate the current pack progress denominator.
      const channels = Array.from(new Set(seed.targetChannels))

      const items = channels.map((channel): PublishPackChannelItem => {
        const job = newestByCreatedAt(seedJobs.filter((entry) => entry.channel === channel))
        const revision = job
          ? seedRevisions.find((entry) => entry.id === job.revisionId)
          : newestByCreatedAt(seedRevisions.filter((entry) => entry.channel === channel))

        return {
          channel,
          revision,
          job,
          state: getChannelState(job, revision),
        }
      })

      const publishedCount = items.filter((item) => item.state === 'published').length
      const totalCount = items.length
      const progressPercent = totalCount === 0 ? 0 : Math.round((publishedCount / totalCount) * 100)
      const nextChannel = items.find((item) => item.state !== 'published')

      return {
        seed,
        channels: items,
        publishedCount,
        totalCount,
        progressPercent,
        isComplete: totalCount > 0 && publishedCount === totalCount,
        nextChannel,
      }
    })
    .sort((left, right) => {
      if (left.isComplete !== right.isComplete) return left.isComplete ? 1 : -1
      return new Date(right.seed.updatedAt).getTime() - new Date(left.seed.updatedAt).getTime()
    })
}

export const PUBLISH_PACK_STATE_LABELS: Record<PublishPackChannelState, string> = {
  missing: '下書き未承認',
  approved: '承認済み',
  ready: '投稿待ち',
  failed: '要確認',
  cancelled: 'キャンセル済み',
  published: '投稿済み',
}
