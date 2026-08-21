import { describe, expect, it } from 'vitest'
import type { Asset } from '@/lib/domain/types'
import {
  hasCompleteAssetPublishingAssignmentCoverage,
  selectAssetsForPublishingChannel,
  type AssetPublishingAssignments,
} from './asset-publishing'

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
    const assignments: AssetPublishingAssignments = {
      all: [],
      ig: ['instagram'],
      video: ['youtube', 'tiktok'],
    }

    expect(selectAssetsForPublishingChannel(assets, assignments, 'instagram').map((entry) => entry.id))
      .toEqual(['all', 'ig'])
    expect(selectAssetsForPublishingChannel(assets, assignments, 'youtube').map((entry) => entry.id))
      .toEqual(['all', 'video'])
  })

  it('detects partial assignment reads so publishing can fail closed', () => {
    const complete: AssetPublishingAssignments = {
      all: [],
      ig: ['instagram'],
    }
    const partial: AssetPublishingAssignments = {
      all: [],
    }

    expect(hasCompleteAssetPublishingAssignmentCoverage(['all', 'ig'], complete)).toBe(true)
    expect(hasCompleteAssetPublishingAssignmentCoverage(['all', 'ig'], partial)).toBe(false)
  })

  it('normalizes duplicate and blank requested ids when checking assignment coverage', () => {
    const assignments: AssetPublishingAssignments = {
      all: [],
      ig: ['instagram'],
    }

    expect(hasCompleteAssetPublishingAssignmentCoverage(['all', '', 'all', 'ig'], assignments)).toBe(true)
    expect(hasCompleteAssetPublishingAssignmentCoverage(['all', '', 'video'], assignments)).toBe(false)
  })
})
