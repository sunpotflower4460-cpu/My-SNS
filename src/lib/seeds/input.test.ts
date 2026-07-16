import { describe, expect, it } from 'vitest'
import { formatBytes, inferAssetType, normalizeTags } from './input'

describe('Seed input utilities', () => {
  it('normalizes and deduplicates comma-separated tags', () => {
    expect(normalizeTags(' Music, release, MUSIC,  ')).toEqual(['music', 'release'])
  })

  it('infers asset type from MIME type before extension', () => {
    expect(inferAssetType('cover.bin', 'image/png')).toBe('image')
    expect(inferAssetType('song.FLAC')).toBe('audio')
    expect(inferAssetType('notes.pdf')).toBe('document')
  })

  it('formats common asset sizes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })
})
