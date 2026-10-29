import type { PublishingChannel, SocialAccount } from '@/lib/domain/types'
import type { ShadowGrowthStrategy, ShadowStrategyImportPayload, ShadowStrategyPattern, ValidatedAccountLink, ValidatedGrowthStrategy } from './types'

export function assertRequestMatchesLink(input: {
  workspaceId: string
  socialAccountId: string
  link: ValidatedAccountLink
}): { ok: true } | { ok: false; code: 'request-workspace-mismatch' | 'request-social-account-mismatch'; message: string } {
  if (input.workspaceId !== input.link.workspaceId) {
    return { ok: false, code: 'request-workspace-mismatch', message: 'request.workspaceId と link.mySns.workspaceId が一致しません。' }
  }
  if (input.socialAccountId !== input.link.socialAccountId) {
    return {
      ok: false,
      code: 'request-social-account-mismatch',
      message: 'request.socialAccountId と link.mySns.socialAccountId が一致しません。',
    }
  }
  return { ok: true }
}

export function assertSocialAccountMatchesImport(input: {
  account: Pick<SocialAccount, 'id' | 'workspaceId' | 'platform'>
  workspaceId: string
  socialAccountId: string
  link: ValidatedAccountLink
  strategy: ValidatedGrowthStrategy
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.account.id !== input.socialAccountId || input.account.id !== input.link.socialAccountId) {
    return { ok: false, code: 'social-account-mismatch', message: 'SocialAccount.id が request / link と一致しません。' }
  }
  if (input.account.workspaceId !== input.workspaceId || input.account.workspaceId !== input.link.workspaceId) {
    return { ok: false, code: 'workspace-mismatch', message: 'SocialAccount.workspace_id が request / link と一致しません。' }
  }
  if (input.account.platform !== input.link.platform || input.account.platform !== input.strategy.platform) {
    return { ok: false, code: 'platform-mismatch', message: 'SocialAccount.platform が link / strategy と一致しません。' }
  }
  return { ok: true }
}

export function projectShadowGrowthStrategy(input: {
  payload: ShadowStrategyImportPayload
  importedAt: string
}): ShadowGrowthStrategy {
  const { link, strategy } = input.payload
  return {
    strategyId: strategy.strategyId,
    workspaceId: link.workspaceId,
    socialAccountId: link.socialAccountId,
    snsAiAccountId: link.snsAiAccountId,
    linkId: link.linkId,
    platform: strategy.platform as PublishingChannel,
    strategyVersion: strategy.strategyVersion,
    status: strategy.status,
    generatedAt: strategy.generatedAt,
    sourceWindow: strategy.sourceWindow,
    sampleSize: strategy.sampleSize,
    overallScore: strategy.overallScore,
    confidence: strategy.confidence,
    exploreRate: strategy.exploreRate,
    preferred: strategy.preferred,
    avoid: strategy.avoid,
    inputsDigest: strategy.inputsDigest,
    importedAt: input.importedAt,
  }
}

function samePatterns(left: ShadowStrategyPattern[], right: ShadowStrategyPattern[]): boolean {
  return left.length === right.length && left.every((pattern, index) => {
    const other = right[index]
    return pattern.dimension === other.dimension
      && pattern.value === other.value
      && pattern.sampleSize === other.sampleSize
      && pattern.averageScore === other.averageScore
      && pattern.lift === other.lift
      && pattern.confidence === other.confidence
      && pattern.rationale === other.rationale
      && pattern.evidencePostIds.length === other.evidencePostIds.length
      && pattern.evidencePostIds.every((id, i) => id === other.evidencePostIds[i])
  })
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right)
}

export function isExactDuplicate(existing: ShadowGrowthStrategy, candidate: ShadowGrowthStrategy): boolean {
  return (
    existing.workspaceId === candidate.workspaceId
    && existing.strategyId === candidate.strategyId
    && existing.socialAccountId === candidate.socialAccountId
    && existing.snsAiAccountId === candidate.snsAiAccountId
    && existing.inputsDigest === candidate.inputsDigest
    && existing.linkId === candidate.linkId
    && existing.platform === candidate.platform
    && existing.strategyVersion === candidate.strategyVersion
    && existing.status === candidate.status
    && sameInstant(existing.generatedAt, candidate.generatedAt)
    && sameInstant(existing.sourceWindow.from, candidate.sourceWindow.from)
    && sameInstant(existing.sourceWindow.to, candidate.sourceWindow.to)
    && existing.sourceWindow.strategyWindowDays === candidate.sourceWindow.strategyWindowDays
    && existing.sourceWindow.matureCheckpointMinutes === candidate.sourceWindow.matureCheckpointMinutes
    && existing.sampleSize === candidate.sampleSize
    && existing.overallScore === candidate.overallScore
    && existing.confidence === candidate.confidence
    && existing.exploreRate === candidate.exploreRate
    && samePatterns(existing.preferred, candidate.preferred)
    && samePatterns(existing.avoid, candidate.avoid)
  )
}

export function isConflictingStrategy(
  existing: Pick<ShadowGrowthStrategy, 'strategyId' | 'inputsDigest' | 'linkId' | 'snsAiAccountId' | 'socialAccountId' | 'platform'>,
  candidate: Pick<ShadowGrowthStrategy, 'strategyId' | 'inputsDigest' | 'linkId' | 'snsAiAccountId' | 'socialAccountId' | 'platform'>,
): boolean {
  if (existing.strategyId !== candidate.strategyId) return false
  return (
    existing.inputsDigest !== candidate.inputsDigest
    || existing.linkId !== candidate.linkId
    || existing.snsAiAccountId !== candidate.snsAiAccountId
    || existing.socialAccountId !== candidate.socialAccountId
    || existing.platform !== candidate.platform
  )
}
