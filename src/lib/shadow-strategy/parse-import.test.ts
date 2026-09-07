import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseShadowStrategyImportPayload } from './parse-import'
import { SHADOW_STRATEGY_IMPORT_MAX_BYTES } from './constants'
import {
  OTHER_SOCIAL_ACCOUNT_ID,
  OTHER_WORKSPACE_ID,
  validActiveStrategy,
  validImportPayload,
  validInsufficientStrategy,
  validLink,
  validPattern,
} from './test-fixtures'

describe('parseShadowStrategyImportPayload', () => {
  it('accepts a valid active strategy with an explicit link', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.strategy.status).toBe('active')
    expect(parsed.value.strategy.preferred).toHaveLength(1)
    expect(JSON.stringify(parsed.value)).not.toMatch(/accessToken|refreshToken/)
  })

  it('accepts a valid insufficient-evidence strategy', () => {
    const parsed = parseShadowStrategyImportPayload({
      link: validLink(),
      strategy: validInsufficientStrategy(),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.strategy.status).toBe('insufficient-evidence')
    expect(parsed.value.strategy.sampleSize).toBe(0)
    expect(parsed.value.strategy.preferred).toEqual([])
  })

  it('rejects a strategy-only payload', () => {
    const parsed = parseShadowStrategyImportPayload({ strategy: validActiveStrategy() })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('missing-link')
  })

  it('rejects a wrong workspace on the strategy subject', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ subject: { workspaceId: OTHER_WORKSPACE_ID, accountId: 'artist-x-fixture' } }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('workspace-mismatch')
  })

  it('rejects a wrong socialAccountId on the link versus later request checks, and wrong SNS-AI accountId here', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ subject: { workspaceId: validLink().mySns.workspaceId, accountId: 'other-sns-ai' } }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('sns-ai-account-mismatch')
  })

  it('rejects a platform mismatch between link and strategy', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ platform: 'instagram' }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('platform-mismatch')
  })

  it('rejects a disabled link', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      link: validLink({ status: 'disabled' }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('disabled-link')
  })

  it('rejects a non-explicit confirmation', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      link: validLink({ confirmation: 'inferred-handle' }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('non-explicit-confirmation')
  })

  it('rejects creatorId when present', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({
        subject: { workspaceId: validLink().mySns.workspaceId, accountId: 'artist-x-fixture', creatorId: 'user-1' },
      }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('creator-id-present')
  })

  it('rejects schema major other than 1', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ meta: { schemaVersion: 2, producer: 'sns-growth-bridge', producedAt: '2026-09-04T00:00:00.000Z', traceId: 't' } }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('unsupported-schema')
  })

  it('rejects an unknown strategy version', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ strategyVersion: 'future-v2' }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('unknown-strategy-version')
  })

  it('rejects invalid-input status', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ status: 'invalid-input' }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-input')
  })

  it('rejects generatedAt without an offset', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ generatedAt: '2026-09-04T12:00:00.000' }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-datetime')
  })

  it('rejects an invalid sourceWindow datetime', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({
        sourceWindow: {
          from: '2026-08-05',
          to: '2026-09-04T12:00:00.000Z',
          strategyWindowDays: 30,
          matureCheckpointMinutes: 1440,
        },
      }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-source-window')
  })

  it('rejects from > to', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({
        sourceWindow: {
          from: '2026-09-05T12:00:00.000Z',
          to: '2026-09-04T12:00:00.000Z',
          strategyWindowDays: 30,
          matureCheckpointMinutes: 1440,
        },
      }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('inverted-source-window')
  })

  it('rejects NaN overallScore', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ overallScore: Number.NaN }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-number')
  })

  it('rejects Infinity confidence', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ confidence: Number.POSITIVE_INFINITY }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-number')
  })

  it('rejects overallScore > 100', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ overallScore: 101 }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-number')
  })

  it('rejects confidence > 1', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ confidence: 1.2 }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-number')
  })

  it('rejects exploreRate > 1', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ exploreRate: 1.01 }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-number')
  })

  it('rejects an invalid pattern', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ preferred: [validPattern({ sampleSize: 0 })] }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-pattern')
  })

  it('rejects an unknown dimension', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ preferred: [validPattern({ dimension: 'language' })] }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('unknown-dimension')
  })

  it('rejects NaN lift', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ preferred: [validPattern({ lift: Number.NaN })] }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-lift')
  })

  it('rejects Infinity lift', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      strategy: validActiveStrategy({ preferred: [validPattern({ lift: Number.NEGATIVE_INFINITY })] }),
    }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('invalid-lift')
  })

  it('rejects insufficient-evidence that still has patterns', () => {
    const parsed = parseShadowStrategyImportPayload({
      link: validLink(),
      strategy: validInsufficientStrategy({ preferred: [validPattern()] }),
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('insufficient-evidence-invariant')
  })

  it('drops unknown fields including secret-like keys instead of storing them', () => {
    const parsed = parseShadowStrategyImportPayload({
      link: validLink({ accessToken: 'secret', credentialKey: 'k' }),
      strategy: validActiveStrategy({ refreshToken: 'secret', mediaUrl: 'https://private.example/file' }),
      extra: { signedUrl: 'https://private.example/signed' },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(JSON.stringify(parsed.value)).not.toMatch(/secret|refreshToken|accessToken|credentialKey|mediaUrl|signedUrl/)
  })

  it('documents the import size limit as 256 KiB', () => {
    expect(SHADOW_STRATEGY_IMPORT_MAX_BYTES).toBe(256 * 1024)
  })

  it('does not treat a different socialAccountId on the link as matching the strategy workspace join', () => {
    const parsed = parseShadowStrategyImportPayload(validImportPayload({
      link: validLink({ mySns: { workspaceId: validLink().mySns.workspaceId, socialAccountId: OTHER_SOCIAL_ACCOUNT_ID } }),
    }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.link.socialAccountId).toBe(OTHER_SOCIAL_ACCOUNT_ID)
  })
})

describe('shadow strategy migration', () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20260907000000_shadow_growth_strategies.sql'),
    'utf8',
  )

  it('enables RLS and does not add browser policies', () => {
    expect(sql).toContain('ALTER TABLE public.shadow_growth_strategies ENABLE ROW LEVEL SECURITY')
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*shadow_growth_strategies/)
    expect(sql).toContain('shadow_growth_strategies rows are immutable')
    expect(sql).toContain("status IN ('active', 'insufficient-evidence')")
    expect(sql).toContain('sample_size >= 0')
    expect(sql).toContain('overall_score >= 0 AND overall_score <= 100')
    expect(sql).toContain('confidence >= 0 AND confidence <= 1')
    expect(sql).toContain('explore_rate >= 0 AND explore_rate <= 1')
    expect(sql).toContain('REFERENCES public.workspaces(id)')
    expect(sql).toContain('REFERENCES public.social_accounts(id)')
  })
})
