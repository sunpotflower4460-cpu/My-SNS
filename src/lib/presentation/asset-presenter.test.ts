import { describe, expect, it } from 'vitest'
import type { Asset } from '@/lib/domain/types'
import { assetTypeLabel, formatAssetSize, getPublishAssetsForSeed, hasUsableAssetUrl } from './asset-presenter'

function asset(over: Partial<Asset>): Asset {
  return {
    id: 'a1',
    workspaceId: 'w1',
    seedId: 's1',
    name: 'cover.png',
    url: 'https://example.com/cover.png',
    type: 'image',
    size: 1536,
    uploadedBy: 'u1',
    createdAt: '2026-08-21T00:00:00Z',
    ...over,
  }
}

describe('asset presenter', () => {
  it('uses concise Japanese type labels', () => {
    expect(assetTypeLabel('image')).toBe('画像')
    expect(assetTypeLabel('video')).toBe('動画')
    expect(assetTypeLabel('audio')).toBe('音声')
    expect(assetTypeLabel('document')).toBe('資料')
  })

  it('formats human-friendly sizes', () => {
    expect(formatAssetSize(0)).toBe('0 B')
    expect(formatAssetSize(900)).toBe('900 B')
    expect(formatAssetSize(1536)).toBe('1.50 KB')
    expect(formatAssetSize(10 * 1024 * 1024)).toBe('10.0 MB')
  })

  it('keeps only assets attached to the requested Seed', () => {
    const assets = [asset({ id: 'a1', seedId: 's1' }), asset({ id: 'a2', seedId: 's2' })]
    expect(getPublishAssetsForSeed(assets, 's1').map((item) => item.id)).toEqual(['a1'])
  })

  it('treats an empty signed URL as temporarily unavailable', () => {
    expect(hasUsableAssetUrl(asset({ url: '  ' }))).toBe(false)
    expect(hasUsableAssetUrl(asset({ url: 'https://example.com/a' }))).toBe(true)
  })
})
