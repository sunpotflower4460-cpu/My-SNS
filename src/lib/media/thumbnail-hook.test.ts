import { describe, expect, it } from 'vitest'
import { isValidThumbnailHook, resolveThumbnailHook, shortenThumbnailHook } from './thumbnail-hook'

describe('shortenThumbnailHook', () => {
  it('keeps a 3–8 character Japanese punchline', () => {
    expect(shortenThumbnailHook('無料公開')).toBe('無料公開')
    expect(shortenThumbnailHook('本日解禁')).toBe('本日解禁')
  })

  it('strips wrappers and takes the first clause, never a paragraph', () => {
    const hook = shortenThumbnailHook('「無料公開します。続きは概要欄へどうぞ」')
    expect(hook).toBe('無料公開します')
    expect(isValidThumbnailHook(hook)).toBe(true)
  })

  it('rejects empty or sentence-length leftovers', () => {
    expect(shortenThumbnailHook('')).toBe('')
    expect(shortenThumbnailHook('   ')).toBe('')
    expect(shortenThumbnailHook('Hi')).toBe('')
  })
})

describe('resolveThumbnailHook', () => {
  it('uses a short overlay from the proposal without labeling it as an AI guess', () => {
    const resolved = resolveThumbnailHook({ proposed: '今すぐ見る', title: 'Unused longer title here', seedTitle: 'Seed' })
    expect(resolved.hook).toBe('今すぐ見る')
    expect(resolved.source).toBe('proposal')
    expect(resolved).not.toHaveProperty('assumption')
  })

  it('does not treat a paragraph-shaped thumbnailTextIdea as overlay text', () => {
    const resolved = resolveThumbnailHook({
      proposed: 'This is a long slogan that would never fit as huge YouTube thumbnail type.',
      title: '無料公開',
      seedTitle: 'Seed',
    })
    expect(resolved.hook).toBe('無料公開')
    expect(resolved.source).toBe('title')
    expect(resolved).not.toHaveProperty('assumption')
  })
})
