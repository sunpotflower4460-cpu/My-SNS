import type { PublishPack, PublishPackChannelItem } from './publish-pack'

const JST = 'Asia/Tokyo'

export interface TodayPublishingOverview {
  duePacks: PublishPack[]
  nextPack?: PublishPack
  nextChannel?: PublishPackChannelItem
  activeCount: number
}

function jstDateKey(value: number | string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function itemPriority(item: PublishPackChannelItem): number {
  if (item.state === 'failed') return 0
  if (item.state === 'ready') return 1
  if (item.state === 'approved' || item.state === 'cancelled') return 2
  if (item.state === 'missing') return 3
  return 4
}

function nextActionableChannel(pack: PublishPack): PublishPackChannelItem | undefined {
  return pack.channels
    .filter((item) => item.state !== 'published')
    .slice()
    .sort((left, right) => itemPriority(left) - itemPriority(right))[0]
}

function earliestDueTime(pack: PublishPack, todayKey: string): number {
  const timestamps = pack.channels
    .flatMap((item) => {
      if (!item.job || item.state === 'published' || item.state === 'cancelled') return []
      const scheduledAt = item.job.scheduledAt
      if (!scheduledAt || jstDateKey(scheduledAt) > todayKey) return []
      return [new Date(scheduledAt).getTime()]
    })
    .filter(Number.isFinite)

  return timestamps.length > 0 ? Math.min(...timestamps) : Number.POSITIVE_INFINITY
}

/**
 * Home-oriented view of publish packs.
 * "Today" includes overdue unfinished jobs: an item that slipped yesterday is
 * still something the creator should see before a newly scheduled item today.
 */
export function buildTodayPublishingOverview(packs: PublishPack[], now: number): TodayPublishingOverview {
  const active = packs.filter((pack) => !pack.isComplete)
  const todayKey = jstDateKey(now)

  const duePacks = active
    .filter((pack) => earliestDueTime(pack, todayKey) !== Number.POSITIVE_INFINITY)
    .slice()
    .sort((left, right) => {
      const byDue = earliestDueTime(left, todayKey) - earliestDueTime(right, todayKey)
      if (byDue !== 0) return byDue
      return new Date(right.seed.updatedAt).getTime() - new Date(left.seed.updatedAt).getTime()
    })

  const ranked = active
    .map((pack) => ({ pack, next: nextActionableChannel(pack) }))
    .filter((entry): entry is { pack: PublishPack; next: PublishPackChannelItem } => Boolean(entry.next))
    .sort((left, right) => {
      const byState = itemPriority(left.next) - itemPriority(right.next)
      if (byState !== 0) return byState

      const leftDue = earliestDueTime(left.pack, todayKey)
      const rightDue = earliestDueTime(right.pack, todayKey)
      if (leftDue !== rightDue) return leftDue - rightDue

      return new Date(right.pack.seed.updatedAt).getTime() - new Date(left.pack.seed.updatedAt).getTime()
    })

  return {
    duePacks,
    nextPack: ranked[0]?.pack,
    nextChannel: ranked[0]?.next,
    activeCount: active.length,
  }
}
