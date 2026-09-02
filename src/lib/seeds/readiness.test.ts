import { describe, expect, it } from 'vitest'
import type { BrandProfile, Seed } from '@/lib/domain/types'
import { evaluateSeedReadiness, resolveSeedAudience, resolveSeedCallToAction, resolveSeedGoal } from './readiness'

const profile: BrandProfile = {
  id: 'brand-1',
  workspaceId: 'workspace-1',
  name: 'Sora',
  description: 'Quiet, honest creator notes.',
  audience: 'People making things at their own pace',
  voiceTraits: ['warm', 'plain-spoken'],
  values: ['honesty'],
  preferredTerms: [],
  avoidedTerms: ['guaranteed'],
  defaultCallToAction: 'Save this if it helps later.',
  language: 'ja',
  isDefault: true,
  createdBy: 'user-1',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

const seed: Seed = {
  id: 'seed-1',
  workspaceId: 'workspace-1',
  title: 'A small release note',
  sourceText: 'The raw thought that should stay intact.',
  kind: 'text',
  status: 'captured',
  goal: 'Share the process without overselling it.',
  keyPoints: [],
  targetChannels: ['youtube', 'note', 'instagram', 'x', 'tiktok'],
  brandProfileId: profile.id,
  tags: [],
  createdBy: 'user-1',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

describe('seed readiness', () => {
  it('uses Brand Profile defaults without copying them into the Seed', () => {
    expect(resolveSeedAudience(seed, profile)).toBe(profile.audience)
    expect(resolveSeedCallToAction(seed, profile)).toBe(profile.defaultCallToAction)
    expect(resolveSeedGoal({ ...seed, goal: undefined }, profile)).toBe(profile.description)
    expect(evaluateSeedReadiness({ ...seed, goal: '' }, { hasAssets: false, brandProfile: profile }).isReady).toBe(true)
    expect(evaluateSeedReadiness(seed, { hasAssets: false, brandProfile: profile })).toEqual({
      score: 100,
      missingFields: [],
      isReady: true,
    })
  })

  it('keeps incomplete input capturable and identifies what PR2 may propose', () => {
    const incomplete = {
      ...seed,
      sourceText: '',
      goal: '',
      targetChannels: [],
      brandProfileId: undefined,
    }

    expect(evaluateSeedReadiness(incomplete, { hasAssets: false })).toEqual({
      score: 17,
      missingFields: ['source', 'goal', 'audience', 'brand_profile', 'target_channels'],
      isReady: false,
    })
  })

  it('accepts an uploaded asset as source material', () => {
    const withoutText = { ...seed, sourceText: '' }
    expect(evaluateSeedReadiness(withoutText, { hasAssets: true, brandProfile: profile }).isReady).toBe(true)
  })
})
