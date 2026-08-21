import { describe, expect, it } from 'vitest'
import type { Asset } from '@/lib/domain/types'
import { getWebShareMediaAssets, inferShareMimeType } from './web-share'

function asset(overrides: Partial<Asset> & Pick<Asset, 'id' | 'name' | 'type'>): Asset {
  return {
    workspaceId: 'w',
    url: 'https://example.com/signed',
    size: 100,
    uploadedBy: 'u',
    createdAt: '2026-08-21T00:00:00Z',
    ...overrides,
  }
}

describe('web share helpers', () => {
  it('selects only image and video assets for SNS sharing', () => {
    const assets = [
      asset({ id: 'image', name: 'photo.png', type: 'image' }),
      asset({ id: 'video', name: 'clip.mp4', type: 'video' }),
      asset({ id: 'audio', name: 'song.wav', type: 'audio' }),
      asset({ id: 'doc', name: 'notes.pdf', type: 'document' }),
    ]

    expect(getWebShareMediaAssets(assets).map((entry) => entry.id)).toEqual(['image', 'video'])
  })

  it('infers common image and video MIME types from filenames', () => {
    expect(inferShareMimeType(asset({ id: 'a', name: 'photo.JPG', type: 'image' }))).toBe('image/jpeg')
    expect(inferShareMimeType(asset({ id: 'b', name: 'movie.mov', type: 'video' }))).toBe('video/quicktime')
  })
})
