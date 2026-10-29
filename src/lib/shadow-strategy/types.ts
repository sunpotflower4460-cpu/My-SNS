import type { PublishingChannel } from '@/lib/domain/types'
import type { SHADOW_STRATEGY_DIMENSIONS, SHADOW_STRATEGY_PLATFORMS } from './constants'

export type ShadowStrategyPlatform = (typeof SHADOW_STRATEGY_PLATFORMS)[number]
export type ShadowStrategyDimension = (typeof SHADOW_STRATEGY_DIMENSIONS)[number]
export type ShadowStrategyStatus = 'active' | 'insufficient-evidence'

export interface ShadowStrategyPattern {
  dimension: ShadowStrategyDimension
  value: string
  sampleSize: number
  averageScore: number
  lift: number
  confidence: number
  rationale: string
  evidencePostIds: string[]
}

export interface ShadowGrowthStrategy {
  strategyId: string
  workspaceId: string
  socialAccountId: string
  snsAiAccountId: string
  linkId: string
  platform: PublishingChannel
  strategyVersion: string
  status: ShadowStrategyStatus
  generatedAt: string
  sourceWindow: {
    from: string
    to: string
    strategyWindowDays: number
    matureCheckpointMinutes: number
  }
  sampleSize: number
  overallScore: number
  confidence: number
  exploreRate: number
  preferred: ShadowStrategyPattern[]
  avoid: ShadowStrategyPattern[]
  inputsDigest: string
  importedAt: string
}

export interface ValidatedAccountLink {
  linkId: string
  platform: ShadowStrategyPlatform
  workspaceId: string
  socialAccountId: string
  snsAiAccountId: string
  confirmedAt: string
}

export interface ValidatedGrowthStrategy {
  strategyId: string
  strategyVersion: 'sns-ai-learn-parity-v1'
  workspaceId: string
  snsAiAccountId: string
  platform: ShadowStrategyPlatform
  generatedAt: string
  sourceWindow: ShadowGrowthStrategy['sourceWindow']
  sampleSize: number
  overallScore: number
  confidence: number
  exploreRate: number
  preferred: ShadowStrategyPattern[]
  avoid: ShadowStrategyPattern[]
  inputsDigest: string
  status: ShadowStrategyStatus
}

export interface ShadowStrategyImportPayload {
  link: ValidatedAccountLink
  strategy: ValidatedGrowthStrategy
}

export type ShadowStrategyParseFailure = {
  ok: false
  code: string
  message: string
}

export type ShadowStrategyParseResult<T> =
  | { ok: true; value: T }
  | ShadowStrategyParseFailure
