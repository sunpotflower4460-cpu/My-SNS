import { describe, expect, it } from 'vitest'
import { inferSeedKindFromFiles } from './input'

describe('inferSeedKindFromFiles', () => {
  it('uses video when only a video is attached', () => {
    expect(inferSeedKindFromFiles(['video'], false)).toBe('video')
  })

  it('uses image when only stills are attached and there is no source text', () => {
    expect(inferSeedKindFromFiles(['image', 'image'], false)).toBe('image')
  })

  it('marks image plus source text as mixed', () => {
    expect(inferSeedKindFromFiles(['image'], true)).toBe('mixed')
  })

  it('returns text when nothing media-like is attached', () => {
    expect(inferSeedKindFromFiles([], true)).toBe('text')
    expect(inferSeedKindFromFiles(['document'], false)).toBe('text')
  })
})
