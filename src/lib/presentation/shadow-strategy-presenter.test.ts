import { describe, expect, it } from 'vitest'
import type { SocialAccount } from '@/lib/domain/types'
import type { ShadowGrowthStrategy } from '@/lib/shadow-strategy/types'
import {
  SHADOW_WARNING,
  canManageShadowStrategy,
  canViewShadowStrategy,
  clientImportPayloadError,
  defaultSelectedSocialAccountId,
  presentShadowStrategy,
} from './shadow-strategy-presenter'

const account = (over: Partial<SocialAccount> = {}): SocialAccount => ({
  id: '22222222-2222-4222-8222-222222222222',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  platform: 'x',
  handle: '@creator',
  connected: true,
  updatedAt: '2026-09-04T00:00:00.000Z',
  ...over,
})

const strategy = (over: Partial<ShadowGrowthStrategy> = {}): ShadowGrowthStrategy => ({
  strategyId: 's1',
  workspaceId: account().workspaceId,
  socialAccountId: account().id,
  snsAiAccountId: 'artist-x',
  linkId: 'link-1',
  platform: 'x',
  strategyVersion: 'sns-ai-learn-parity-v1',
  status: 'active',
  generatedAt: '2026-09-04T12:00:00.000Z',
  sourceWindow: {
    from: '2026-08-05T12:00:00.000Z',
    to: '2026-09-04T12:00:00.000Z',
    strategyWindowDays: 30,
    matureCheckpointMinutes: 1440,
  },
  sampleSize: 8,
  overallScore: 61,
  confidence: 0.4,
  exploreRate: 0.2,
  preferred: [{
    dimension: 'hook',
    value: 'question',
    sampleSize: 4,
    averageScore: 70,
    lift: 5,
    confidence: 0.4,
    rationale: 'detail',
    evidencePostIds: ['p1', 'p2', 'p3', 'p4'],
  }],
  avoid: [{
    dimension: 'cta',
    value: 'hard-sell',
    sampleSize: 3,
    averageScore: 40,
    lift: -4,
    confidence: 0.3,
    rationale: 'detail',
    evidencePostIds: ['p5', 'p6', 'p7'],
  }],
  inputsDigest: 'digest',
  importedAt: '2026-09-07T00:00:00.000Z',
  ...over,
})

describe('shadow strategy presenter', () => {
  it('shows an empty state when there is no strategy', () => {
    const view = presentShadowStrategy(null)
    expect(view.empty).toBe(true)
    expect(view.statusCopy).toBeNull()
    expect(view.warning).toBe(SHADOW_WARNING)
    expect(view.warning).toContain('分析表示専用')
    expect(view.warning).toContain('AI投稿生成・予約・公開には使用されていません')
  })

  it('shows the active copy, preferred, avoid, and SHADOW warning', () => {
    const view = presentShadowStrategy(strategy())
    expect(view.empty).toBe(false)
    expect(view.statusCopy).toBe('最近の反応から見えた傾向')
    expect(view.preferredTitle).toBe('最近伸びやすかった傾向')
    expect(view.avoidTitle).toBe('最近弱かった傾向')
    expect(view.preferred[0]?.value).toBe('question')
    expect(view.avoid[0]?.value).toBe('hard-sell')
    expect(view.avoidTitle).not.toMatch(/禁止|やってはいけない/)
  })

  it('shows a neutral insufficient-evidence message', () => {
    const view = presentShadowStrategy(strategy({
      status: 'insufficient-evidence',
      sampleSize: 0,
      confidence: 0,
      preferred: [],
      avoid: [],
    }))
    expect(view.statusCopy).toBe('まだ判断に十分な実績データがありません')
    expect(view.preferred).toEqual([])
    expect(view.avoid).toEqual([])
  })

  it('hides the section from editor and viewer, and shows import for owner/admin', () => {
    expect(canViewShadowStrategy('editor')).toBe(false)
    expect(canViewShadowStrategy('viewer')).toBe(false)
    expect(canViewShadowStrategy('contributor')).toBe(false)
    expect(canManageShadowStrategy('owner')).toBe(true)
    expect(canManageShadowStrategy('admin')).toBe(true)
    expect(canManageShadowStrategy('editor')).toBe(false)
  })

  it('selects social accounts by id, not handle', () => {
    const first = account({ id: 'aaaaaaa1-1111-4111-8111-111111111111', handle: 'zeta', platform: 'instagram' })
    const second = account({ id: 'bbbbbbb2-2222-4222-8222-222222222222', handle: 'alpha', platform: 'x' })
    expect(defaultSelectedSocialAccountId([first, second])).toBe(first.id)
  })

  it('only checks JSON syntax on the client', () => {
    expect(clientImportPayloadError('')).toBe('JSONを貼り付けてください。')
    expect(clientImportPayloadError('{')).toBe('JSONの形式が正しくありません。')
    expect(clientImportPayloadError('{ "link": {}, "strategy": {} }')).toBeNull()
  })
})
