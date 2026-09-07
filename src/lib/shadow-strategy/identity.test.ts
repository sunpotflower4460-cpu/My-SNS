import { describe, expect, it } from 'vitest'
import { assertRequestMatchesLink, assertSocialAccountMatchesImport, isConflictingStrategy, isExactDuplicate, projectShadowGrowthStrategy } from './projection'
import { parseShadowStrategyImportPayload } from './parse-import'
import {
  OTHER_SOCIAL_ACCOUNT_ID,
  OTHER_WORKSPACE_ID,
  SOCIAL_ACCOUNT_ID,
  SNS_AI_ACCOUNT_ID,
  WORKSPACE_ID,
  validImportPayload,
} from './test-fixtures'

const parsed = () => {
  const result = parseShadowStrategyImportPayload(validImportPayload())
  if (!result.ok) throw new Error(result.message)
  return result.value
}

describe('shadow strategy identity', () => {
  it('requires request workspace == link workspace == DB SocialAccount workspace', () => {
    const payload = parsed()
    expect(assertRequestMatchesLink({
      workspaceId: WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      link: payload.link,
    }).ok).toBe(true)
    expect(assertRequestMatchesLink({
      workspaceId: OTHER_WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      link: payload.link,
    }).ok).toBe(false)
    expect(assertSocialAccountMatchesImport({
      account: { id: SOCIAL_ACCOUNT_ID, workspaceId: WORKSPACE_ID, platform: 'x' },
      workspaceId: WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      link: payload.link,
      strategy: payload.strategy,
    }).ok).toBe(true)
    expect(assertSocialAccountMatchesImport({
      account: { id: SOCIAL_ACCOUNT_ID, workspaceId: OTHER_WORKSPACE_ID, platform: 'x' },
      workspaceId: WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      link: payload.link,
      strategy: payload.strategy,
    }).ok).toBe(false)
  })

  it('requires request socialAccount == link socialAccount == DB SocialAccount id', () => {
    const payload = parsed()
    expect(assertRequestMatchesLink({
      workspaceId: WORKSPACE_ID,
      socialAccountId: OTHER_SOCIAL_ACCOUNT_ID,
      link: payload.link,
    }).ok).toBe(false)
    expect(assertSocialAccountMatchesImport({
      account: { id: OTHER_SOCIAL_ACCOUNT_ID, workspaceId: WORKSPACE_ID, platform: 'x' },
      workspaceId: WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      link: payload.link,
      strategy: payload.strategy,
    }).ok).toBe(false)
  })

  it('requires link accountId == strategy subject.accountId', () => {
    const payload = parsed()
    expect(payload.link.snsAiAccountId).toBe(SNS_AI_ACCOUNT_ID)
    expect(payload.strategy.snsAiAccountId).toBe(SNS_AI_ACCOUNT_ID)
  })

  it('requires link platform == strategy platform == DB platform', () => {
    const payload = parsed()
    expect(payload.link.platform).toBe('x')
    expect(payload.strategy.platform).toBe('x')
    expect(assertSocialAccountMatchesImport({
      account: { id: SOCIAL_ACCOUNT_ID, workspaceId: WORKSPACE_ID, platform: 'instagram' },
      workspaceId: WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
      link: payload.link,
      strategy: payload.strategy,
    }).ok).toBe(false)
  })

  it('does not use handle or externalAccountId as identity', () => {
    const payload = parsed()
    const projected = projectShadowGrowthStrategy({ payload, importedAt: '2026-09-07T00:00:00.000Z' })
    expect(projected).not.toHaveProperty('handle')
    expect(projected).not.toHaveProperty('externalAccountId')
  })

  it('marks exact duplicates and conflicting strategyIds correctly', () => {
    const payload = parsed()
    const projected = projectShadowGrowthStrategy({ payload, importedAt: '2026-09-07T00:00:00.000Z' })
    expect(isExactDuplicate(projected, projected)).toBe(true)
    expect(isConflictingStrategy(projected, { ...projected, inputsDigest: 'other' })).toBe(true)
    expect(isConflictingStrategy(projected, { ...projected, platform: 'instagram' })).toBe(true)
    expect(isConflictingStrategy(projected, projected)).toBe(false)
  })
})
