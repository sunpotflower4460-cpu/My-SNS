import type { BrandProfile, Seed } from '@/lib/domain/types'

export type SeedReadinessField =
  | 'title'
  | 'source'
  | 'goal'
  | 'audience'
  | 'brand_profile'
  | 'target_channels'

export interface SeedReadiness {
  score: number
  missingFields: SeedReadinessField[]
  isReady: boolean
}

type ReadinessSeed = Pick<
  Seed,
  'title' | 'sourceText' | 'goal' | 'audience' | 'brandProfileId' | 'targetChannels'
>

function hasText(value?: string): boolean {
  return Boolean(value?.trim())
}

export function resolveSeedAudience(seed: Pick<Seed, 'audience'>, brandProfile?: BrandProfile | null): string {
  return seed.audience?.trim() || brandProfile?.audience?.trim() || ''
}

export function resolveSeedCallToAction(
  seed: Pick<Seed, 'callToAction'>,
  brandProfile?: BrandProfile | null,
): string {
  return seed.callToAction?.trim() || brandProfile?.defaultCallToAction?.trim() || ''
}

export function evaluateSeedReadiness(
  seed: ReadinessSeed,
  options: { hasAssets: boolean; brandProfile?: BrandProfile | null },
): SeedReadiness {
  const checks: Array<[SeedReadinessField, boolean]> = [
    ['title', hasText(seed.title)],
    ['source', hasText(seed.sourceText) || options.hasAssets],
    ['goal', hasText(seed.goal)],
    ['audience', hasText(resolveSeedAudience(seed, options.brandProfile))],
    ['brand_profile', Boolean(seed.brandProfileId && options.brandProfile)],
    ['target_channels', seed.targetChannels.length > 0],
  ]

  const missingFields = checks.filter(([, complete]) => !complete).map(([field]) => field)
  const completeCount = checks.length - missingFields.length

  return {
    score: Math.round((completeCount / checks.length) * 100),
    missingFields,
    isReady: missingFields.length === 0,
  }
}
