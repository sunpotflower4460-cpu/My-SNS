import type { PublishingChannel } from '@/lib/domain/types'
import type { PublishPack } from './publish-pack'

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function buildPublishPackHref(seedId: string, channel?: PublishingChannel): string {
  const params = new URLSearchParams({ seed: seedId })
  if (channel) params.set('channel', channel)
  return `/app/packs?${params.toString()}`
}

export function publishPackDomId(seedId: string): string {
  return `publish-pack-${safeIdPart(seedId)}`
}

export function publishPackChannelDomId(seedId: string, channel: PublishingChannel): string {
  return `${publishPackDomId(seedId)}-${safeIdPart(channel)}`
}

export type PublishPackAdvanceDecision =
  | { status: 'waiting' }
  | { status: 'next'; seedId: string; channel: PublishingChannel }
  | { status: 'done' }

/**
 * Decide where the posting workflow should go after one channel is marked
 * published. `waiting` is intentional: the provider may resolve the mutation
 * before the derived pack state reaches the page, so callers should keep the
 * pending advance and try again on the next state update.
 */
export function choosePublishPackAdvance(
  packs: PublishPack[],
  completed: { seedId: string; channel: PublishingChannel },
): PublishPackAdvanceDecision {
  const currentPack = packs.find((pack) => pack.seed.id === completed.seedId)
  if (!currentPack) return { status: 'done' }

  if (!currentPack.isComplete && currentPack.nextChannel?.channel === completed.channel) {
    return { status: 'waiting' }
  }

  const targetPack = !currentPack.isComplete && currentPack.nextChannel
    ? currentPack
    : packs.find((pack) => !pack.isComplete && pack.nextChannel)
  const targetChannel = targetPack?.nextChannel

  if (!targetPack || !targetChannel) return { status: 'done' }

  return {
    status: 'next',
    seedId: targetPack.seed.id,
    channel: targetChannel.channel,
  }
}
