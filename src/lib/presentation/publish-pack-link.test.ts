import { describe, expect, it } from 'vitest'
import type { PublishPack } from './publish-pack'
import {
  buildPublishPackHref,
  choosePublishPackAdvance,
  publishPackChannelDomId,
  publishPackDomId,
} from './publish-pack-link'

function pack(seedId: string, options: { isComplete?: boolean; nextChannel?: 'instagram' | 'youtube' | 'x' } = {}): PublishPack {
  const nextChannel = options.nextChannel
    ? { channel: options.nextChannel, state: 'ready' as const }
    : undefined

  return {
    seed: { id: seedId } as PublishPack['seed'],
    channels: nextChannel ? [nextChannel] : [],
    publishedCount: options.isComplete ? 1 : 0,
    totalCount: 1,
    progressPercent: options.isComplete ? 100 : 0,
    isComplete: options.isComplete ?? false,
    nextChannel,
  }
}

describe('publish pack links', () => {
  it('builds a focused pack URL with an optional channel', () => {
    expect(buildPublishPackHref('seed-1', 'instagram')).toBe('/app/packs?seed=seed-1&channel=instagram')
    expect(buildPublishPackHref('seed-1')).toBe('/app/packs?seed=seed-1')
  })

  it('normalizes DOM ids without changing normal UUID-like ids', () => {
    expect(publishPackDomId('seed:1')).toBe('publish-pack-seed-1')
    expect(publishPackChannelDomId('seed:1', 'youtube')).toBe('publish-pack-seed-1-youtube')
  })

  it('waits until the completed channel disappears from derived next state', () => {
    expect(choosePublishPackAdvance(
      [pack('seed-1', { nextChannel: 'instagram' })],
      { seedId: 'seed-1', channel: 'instagram' },
    )).toEqual({ status: 'waiting' })
  })

  it('moves to the next channel in the same pack first', () => {
    expect(choosePublishPackAdvance(
      [pack('seed-1', { nextChannel: 'youtube' }), pack('seed-2', { nextChannel: 'x' })],
      { seedId: 'seed-1', channel: 'instagram' },
    )).toEqual({ status: 'next', seedId: 'seed-1', channel: 'youtube' })
  })

  it('moves to the next active pack when the current pack completes', () => {
    expect(choosePublishPackAdvance(
      [pack('seed-1', { isComplete: true }), pack('seed-2', { nextChannel: 'x' })],
      { seedId: 'seed-1', channel: 'instagram' },
    )).toEqual({ status: 'next', seedId: 'seed-2', channel: 'x' })
  })

  it('reports done when no active posting work remains', () => {
    expect(choosePublishPackAdvance(
      [pack('seed-1', { isComplete: true })],
      { seedId: 'seed-1', channel: 'instagram' },
    )).toEqual({ status: 'done' })
  })
})
