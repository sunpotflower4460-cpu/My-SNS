import type { PublishingChannel } from '@/lib/domain/types'

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
