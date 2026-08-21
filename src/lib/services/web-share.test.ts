import { describe, expect, it } from 'vitest'
import type { Asset } from '@/lib/domain/types'
import { getWebShareMediaAssets, inferShareMimeType, resolveShareMimeType } from './web-share'

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

  it('replaces generic storage MIME types with a filename-based shareable type', () => {
    const photo = asset({ id: 'photo', name: 'photo.png', type: 'image' })
    const video = asset({ id: 'video', name: 'clip.mp4', type: 'video' })

    expect(resolveShareMimeType(photo, 'application/octet-stream')).toBe('image/png')
    expect(resolveShareMimeType(video, 'binary/octet-stream')).toBe('video/mp4')
    expect(resolveShareMimeType(photo, '')).toBe('image/png')
  })

  it('preserves a concrete response MIME type when storage provides one', () => {
    const photo = asset({ id: 'photo', name: 'photo.png', type: 'image' })

    expect(resolveShareMimeType(photo, 'image/webp')).toBe('image/webp')
  })
})
