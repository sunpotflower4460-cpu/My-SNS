import { describe, expect, it } from 'vitest'
import { insertShadowStrategy, listShadowStrategies, ShadowStrategyConflictError } from '@/lib/repositories/supabase/shadow-strategies'
import { parseShadowStrategyImportPayload } from '@/lib/shadow-strategy/parse-import'
import { projectShadowGrowthStrategy } from '@/lib/shadow-strategy/projection'
import { SOCIAL_ACCOUNT_ID, WORKSPACE_ID, validImportPayload } from '@/lib/shadow-strategy/test-fixtures'
import type { ShadowGrowthStrategy } from '@/lib/shadow-strategy/types'

type QueryResult = { data: unknown; error: { code?: string; message: string } | null }

function rowOf(strategy: ShadowGrowthStrategy) {
  return {
    strategy_id: strategy.strategyId,
    workspace_id: strategy.workspaceId,
    social_account_id: strategy.socialAccountId,
    sns_ai_account_id: strategy.snsAiAccountId,
    link_id: strategy.linkId,
    platform: strategy.platform,
    strategy_version: strategy.strategyVersion,
    status: strategy.status,
    generated_at: strategy.generatedAt,
    source_window_from: strategy.sourceWindow.from,
    source_window_to: strategy.sourceWindow.to,
    strategy_window_days: strategy.sourceWindow.strategyWindowDays,
    mature_checkpoint_minutes: strategy.sourceWindow.matureCheckpointMinutes,
    sample_size: strategy.sampleSize,
    overall_score: strategy.overallScore,
    confidence: strategy.confidence,
    explore_rate: strategy.exploreRate,
    preferred: strategy.preferred,
    avoid: strategy.avoid,
    inputs_digest: strategy.inputsDigest,
    imported_at: strategy.importedAt,
  }
}

function createFakeClient(store: ShadowGrowthStrategy[]) {
  const table = {
    select() { return table },
    insert(values: Record<string, unknown>) {
      table._insert = values
      return table
    },
    eq(column: string, value: string) {
      table._filters.push([column, value])
      return table
    },
    order() { return table },
    limit(n: number) {
      table._limit = n
      return table
    },
    maybeSingle(): Promise<QueryResult> {
      const found = store.find((item) => matches(item, table._filters))
      return Promise.resolve({ data: found ? rowOf(found) : null, error: null })
    },
    async single(): Promise<QueryResult> {
      if (table._insert) {
        if (typeof table._insert.updateShadowStrategy === 'function') {
          throw new Error('update must not exist')
        }
        const projected: ShadowGrowthStrategy = {
          strategyId: String(table._insert.strategy_id),
          workspaceId: String(table._insert.workspace_id),
          socialAccountId: String(table._insert.social_account_id),
          snsAiAccountId: String(table._insert.sns_ai_account_id),
          linkId: String(table._insert.link_id),
          platform: table._insert.platform as ShadowGrowthStrategy['platform'],
          strategyVersion: String(table._insert.strategy_version),
          status: table._insert.status as ShadowGrowthStrategy['status'],
          generatedAt: String(table._insert.generated_at),
          sourceWindow: {
            from: String(table._insert.source_window_from),
            to: String(table._insert.source_window_to),
            strategyWindowDays: Number(table._insert.strategy_window_days),
            matureCheckpointMinutes: Number(table._insert.mature_checkpoint_minutes),
          },
          sampleSize: Number(table._insert.sample_size),
          overallScore: Number(table._insert.overall_score),
          confidence: Number(table._insert.confidence),
          exploreRate: Number(table._insert.explore_rate),
          preferred: table._insert.preferred as ShadowGrowthStrategy['preferred'],
          avoid: table._insert.avoid as ShadowGrowthStrategy['avoid'],
          inputsDigest: String(table._insert.inputs_digest),
          importedAt: String(table._insert.imported_at),
        }
        const duplicate = store.find((item) => item.workspaceId === projected.workspaceId && item.strategyId === projected.strategyId)
        if (duplicate) {
          return { data: null, error: { code: '23505', message: 'duplicate' } }
        }
        store.push(projected)
        return { data: rowOf(projected), error: null }
      }
      const rows = store.filter((item) => matches(item, table._filters))
      return { data: rows[0] ? rowOf(rows[0]) : null, error: null }
    },
    then(resolve: (result: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
      const filtered = store
        .filter((item) => matches(item, table._filters))
        .sort((left, right) => {
          if (left.generatedAt !== right.generatedAt) return right.generatedAt.localeCompare(left.generatedAt)
          if (left.importedAt !== right.importedAt) return right.importedAt.localeCompare(left.importedAt)
          return right.strategyId.localeCompare(left.strategyId)
        })
      const rows = filtered.slice(0, table._limit ?? filtered.length)
      return Promise.resolve({ data: rows.map(rowOf), error: null }).then(resolve, reject)
    },
    _filters: [] as Array<[string, string]>,
    _insert: null as Record<string, unknown> | null,
    _limit: undefined as number | undefined,
  }

  return {
    from(name: string) {
      if (name !== 'shadow_growth_strategies') throw new Error(`unexpected table ${name}`)
      table._filters = []
      table._insert = null
      table._limit = undefined
      return table
    },
  }
}

function matches(item: ShadowGrowthStrategy, filters: Array<[string, string]>): boolean {
  return filters.every(([column, value]) => {
    if (column === 'workspace_id') return item.workspaceId === value
    if (column === 'social_account_id') return item.socialAccountId === value
    if (column === 'strategy_id') return item.strategyId === value
    return false
  })
}

function strategy(): ShadowGrowthStrategy {
  const parsed = parseShadowStrategyImportPayload(validImportPayload())
  if (!parsed.ok) throw new Error(parsed.message)
  return projectShadowGrowthStrategy({ payload: parsed.value, importedAt: '2026-09-07T00:00:00.000Z' })
}

describe('shadow strategy repository', () => {
  it('inserts the first snapshot', async () => {
    const store: ShadowGrowthStrategy[] = []
    const result = await insertShadowStrategy(createFakeClient(store) as never, strategy(), 'user-1')
    expect(result.created).toBe(true)
    expect(store).toHaveLength(1)
  })

  it('returns the existing row for an exact duplicate', async () => {
    const first = strategy()
    const store = [first]
    const result = await insertShadowStrategy(createFakeClient(store) as never, { ...first, importedAt: '2026-09-08T00:00:00.000Z' }, 'user-1')
    expect(result.created).toBe(false)
    expect(result.strategy.importedAt).toBe(first.importedAt)
    expect(store).toHaveLength(1)
  })

  it('fails closed on the same strategyId with a different digest', async () => {
    const store = [strategy()]
    await expect(insertShadowStrategy(createFakeClient(store) as never, { ...strategy(), inputsDigest: 'other' }, 'user-1'))
      .rejects.toBeInstanceOf(ShadowStrategyConflictError)
    expect(store).toHaveLength(1)
  })

  it('does not expose an update function', async () => {
    const repo = await import('@/lib/repositories/supabase/shadow-strategies')
    expect('updateShadowStrategy' in repo).toBe(false)
    expect(typeof repo.insertShadowStrategy).toBe('function')
    expect(typeof repo.listShadowStrategies).toBe('function')
  })

  it('isolates workspace reads', async () => {
    const store = [strategy()]
    const rows = await listShadowStrategies(createFakeClient(store) as never, '99999999-9999-4999-8999-999999999999', SOCIAL_ACCOUNT_ID)
    expect(rows).toEqual([])
  })

  it('does not return another social account\'s snapshot', async () => {
    const store = [strategy()]
    const rows = await listShadowStrategies(createFakeClient(store) as never, WORKSPACE_ID, '55555555-5555-4555-8555-555555555555')
    expect(rows).toEqual([])
  })

  it('orders latest by generatedAt, importedAt, strategyId descending', async () => {
    const base = strategy()
    const store = [
      { ...base, strategyId: 'a', generatedAt: '2026-09-01T00:00:00.000Z', importedAt: '2026-09-07T00:00:00.000Z' },
      { ...base, strategyId: 'c', generatedAt: '2026-09-03T00:00:00.000Z', importedAt: '2026-09-07T00:00:00.000Z' },
      { ...base, strategyId: 'b', generatedAt: '2026-09-03T00:00:00.000Z', importedAt: '2026-09-08T00:00:00.000Z' },
    ]
    const rows = await listShadowStrategies(createFakeClient(store) as never, WORKSPACE_ID, SOCIAL_ACCOUNT_ID, 10)
    expect(rows.map((row) => row.strategyId)).toEqual(['b', 'c', 'a'])
  })

  it('stores only safe audit metadata', async () => {
    const { shadowStrategyAuditMetadata } = await import('@/lib/repositories/supabase/shadow-strategies')
    const metadata = shadowStrategyAuditMetadata(strategy())
    expect(metadata).toEqual({
      strategyId: strategy().strategyId,
      socialAccountId: strategy().socialAccountId,
      platform: strategy().platform,
      strategyVersion: strategy().strategyVersion,
      status: strategy().status,
      sampleSize: strategy().sampleSize,
      inputsDigest: strategy().inputsDigest,
    })
    expect(JSON.stringify(metadata)).not.toMatch(/preferred|avoid|"link"|GrowthStrategy/)
  })
})
