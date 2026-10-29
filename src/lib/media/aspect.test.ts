import { describe, expect, it } from 'vitest'
import { aspectLabel, classifyAspectRatio, suggestedPublishingChannelsForAspect } from './aspect'

describe('classifyAspectRatio', () => {
  it('recognizes 16:9 and 9:16 with a small tolerance', () => {
    expect(classifyAspectRatio(1920, 1080)).toBe('16:9')
    expect(classifyAspectRatio(1280, 720)).toBe('16:9')
    expect(classifyAspectRatio(1080, 1920)).toBe('9:16')
    expect(classifyAspectRatio(720, 1280)).toBe('9:16')
    expect(classifyAspectRatio(1080, 1080)).toBe('1:1')
  })

  it('does not guess an in-between rectangle', () => {
    expect(classifyAspectRatio(1200, 800)).toBe('other')
    expect(classifyAspectRatio(0, 1080)).toBe('other')
  })
})

describe('suggestedPublishingChannelsForAspect', () => {
  it('keeps unknown/non-video assets on the legacy all-channel assignment', () => {
    expect(suggestedPublishingChannelsForAspect('16:9', 'image')).toEqual([])
    expect(suggestedPublishingChannelsForAspect(null, 'video')).toEqual([])
  })

  it('assigns 16:9 video to YouTube only so TikTok/Reels cannot inherit a landscape master', () => {
    expect(suggestedPublishingChannelsForAspect('16:9', 'video')).toEqual(['youtube'])
  })

  it('assigns 9:16 video to YouTube Shorts, Instagram, and TikTok', () => {
    expect(suggestedPublishingChannelsForAspect('9:16', 'video')).toEqual(['youtube', 'instagram', 'tiktok'])
  })
})

describe('aspectLabel', () => {
  it('labels known ratios in Japanese', () => {
    expect(aspectLabel('16:9')).toContain('16:9')
    expect(aspectLabel(undefined)).toBe('比率未設定')
  })
})
