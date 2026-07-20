import { describe, expect, it } from 'vitest'
import { countSeedsByKind, filterSeeds } from './seeds-presenter'
import type { Seed, SeedKind } from '@/lib/domain/types'

function seed(over: Partial<Seed> & { id: string }): Seed {
  return {
    workspaceId: 'w',
    title: 'Untitled',
    kind: 'text',
    status: 'captured',
    keyPoints: [],
    targetChannels: [],
    tags: [],
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

const seeds: Seed[] = [
  seed({ id: 'song', kind: 'music', title: '新曲のデモ', sourceText: 'アコースティック', tags: ['demo', 'wip'] }),
  seed({ id: 'clip', kind: 'video', title: 'Behind the scenes', tags: ['vlog'] }),
  seed({ id: 'note', kind: 'text', title: 'エッセイ下書き', sourceText: '日々のこと' }),
]

describe('filterSeeds', () => {
  it('returns everything for kind=all and empty search', () => {
    expect(filterSeeds(seeds, { kind: 'all', search: '' }).map((s) => s.id)).toEqual(['song', 'clip', 'note'])
  })

  it('filters by kind', () => {
    expect(filterSeeds(seeds, { kind: 'music', search: '' }).map((s) => s.id)).toEqual(['song'])
  })

  it('matches the search needle against title (case-insensitive)', () => {
    expect(filterSeeds(seeds, { kind: 'all', search: 'BEHIND' }).map((s) => s.id)).toEqual(['clip'])
  })

  it('matches against source text and tags', () => {
    expect(filterSeeds(seeds, { kind: 'all', search: 'アコースティック' }).map((s) => s.id)).toEqual(['song'])
    expect(filterSeeds(seeds, { kind: 'all', search: 'vlog' }).map((s) => s.id)).toEqual(['clip'])
  })

  it('combines kind and search (both must match)', () => {
    expect(filterSeeds(seeds, { kind: 'music', search: 'エッセイ' })).toEqual([])
    expect(filterSeeds(seeds, { kind: 'text', search: '下書き' }).map((s) => s.id)).toEqual(['note'])
  })

  it('trims and lowercases the search needle', () => {
    expect(filterSeeds(seeds, { kind: 'all', search: '  Wip  ' }).map((s) => s.id)).toEqual(['song'])
  })

  it('returns nothing when the needle matches no field', () => {
    expect(filterSeeds(seeds, { kind: 'all', search: 'zzz-not-here' })).toEqual([])
  })
})

describe('countSeedsByKind', () => {
  it('counts per kind and total for all', () => {
    const kinds: Array<SeedKind | 'all'> = ['all', 'music', 'video', 'image', 'text', 'mixed']
    expect(countSeedsByKind(seeds, kinds)).toEqual({ all: 3, music: 1, video: 1, image: 0, text: 1, mixed: 0 })
  })
})
