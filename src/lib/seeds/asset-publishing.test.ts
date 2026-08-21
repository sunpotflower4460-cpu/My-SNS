import { describe, expect, it } from 'vitest'
import type { Asset } from '@/lib/domain/types'
import { selectAssetsForPublishingChannel } from './asset-publishing'

function asset(id: string): Asset {
  return {
    id,
    workspaceId: 'workspace-1',
    seedId: 'seed-1',
    name: `${id}.png`,
    url: 'https://example.com/signed',
    type: 'image',
    size: 100,
    uploadedBy: 'user-1',
    createdAt: '2026-08-21T00:00:00Z',
  }
}

describe('asset publishing assignments', () => {
  const assets = [asset('all'), asset('ig'), asset('video')]

  it('keeps unassigned assets available to every channel for backwards compatibility', () => {
    expect(selectAssetsForPublishingChannel(assets, {}, 'youtube').map((entry) => entry.id))
      .toEqual(['all', 'ig', 'video'])
  })

  it('includes empty assignments as all-channel assets and filters explicit assignments', () => {
    const assignments = {
      all: [],
      ig: ['instagram'] as const,
      video: ['youtube', 'tiktok'] as const,
    }

    expect(selectAssetsForPublishingChannel(assets, assignments, 'instagram').map((entry) => entry.id))
      .toEqual(['all', 'ig'])
    expect(selectAssetsForPublishingChannel(assets, assignments, 'youtube').map((entry) => entry.id))
      .toEqual(['all', 'video'])
  })
})
