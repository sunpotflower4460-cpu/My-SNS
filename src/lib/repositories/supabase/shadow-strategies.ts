import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublishingChannel, SocialAccount, SocialPlatform } from '@/lib/domain/types'
import { SHADOW_STRATEGY_HISTORY_LIMIT } from '@/lib/shadow-strategy/constants'
import { isConflictingStrategy, isExactDuplicate } from '@/lib/shadow-strategy/projection'
import type { ShadowGrowthStrategy, ShadowStrategyPattern } from '@/lib/shadow-strategy/types'

export class ShadowStrategyConflictError extends Error {
  constructor() {
    super('同じ strategyId で異なる内容の Shadow Strategy が既に存在します。')
    this.name = 'ShadowStrategyConflictError'
  }
}

interface ShadowGrowthStrategyRow {
  strategy_id: string
  workspace_id: string
  social_account_id: string
  sns_ai_account_id: string
  link_id: string
  platform: string
  strategy_version: string
  status: ShadowGrowthStrategy['status']
  generated_at: string
  source_window_from: string
  source_window_to: string
  strategy_window_days: number
  mature_checkpoint_minutes: number
  sample_size: number
  overall_score: number | string
  confidence: number | string
  explore_rate: number | string
  preferred: ShadowStrategyPattern[]
  avoid: ShadowStrategyPattern[]
  inputs_digest: string
  imported_at: string
}

function asNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value)
}

function mapRow(row: ShadowGrowthStrategyRow): ShadowGrowthStrategy {
  return {
    strategyId: row.strategy_id,
    workspaceId: row.workspace_id,
    socialAccountId: row.social_account_id,
    snsAiAccountId: row.sns_ai_account_id,
    linkId: row.link_id,
    platform: row.platform as PublishingChannel,
    strategyVersion: row.strategy_version,
    status: row.status,
    generatedAt: row.generated_at,
    sourceWindow: {
      from: row.source_window_from,
      to: row.source_window_to,
      strategyWindowDays: row.strategy_window_days,
      matureCheckpointMinutes: row.mature_checkpoint_minutes,
    },
    sampleSize: row.sample_size,
    overallScore: asNumber(row.overall_score),
    confidence: asNumber(row.confidence),
    exploreRate: asNumber(row.explore_rate),
    preferred: row.preferred,
    avoid: row.avoid,
    inputsDigest: row.inputs_digest,
    importedAt: row.imported_at,
  }
}

function toInsertRow(strategy: ShadowGrowthStrategy, importedBy: string): Omit<ShadowGrowthStrategyRow, 'imported_at'> & {
  imported_by: string
  imported_at?: string
} {
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
    imported_by: importedBy,
    imported_at: strategy.importedAt,
  }
}

export async function getSocialAccountIdentity(
  supabase: SupabaseClient,
  workspaceId: string,
  socialAccountId: string,
): Promise<SocialAccount | null> {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('id, workspace_id, platform, handle, connected, connected_at, external_account_id, updated_at')
    .eq('id', socialAccountId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    platform: data.platform as SocialPlatform,
    handle: data.handle,
    connected: data.connected,
    connectedAt: data.connected_at ?? undefined,
    externalAccountId: data.external_account_id ?? undefined,
    updatedAt: data.updated_at,
  }
}

export async function listShadowStrategies(
  supabase: SupabaseClient,
  workspaceId: string,
  socialAccountId: string,
  limit = SHADOW_STRATEGY_HISTORY_LIMIT,
): Promise<ShadowGrowthStrategy[]> {
  const { data, error } = await supabase
    .from('shadow_growth_strategies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('social_account_id', socialAccountId)
    .order('generated_at', { ascending: false })
    .order('imported_at', { ascending: false })
    .order('strategy_id', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapRow(row as ShadowGrowthStrategyRow))
}

export async function findShadowStrategyByStrategyId(
  supabase: SupabaseClient,
  workspaceId: string,
  strategyId: string,
): Promise<ShadowGrowthStrategy | null> {
  const { data, error } = await supabase
    .from('shadow_growth_strategies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('strategy_id', strategyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapRow(data as ShadowGrowthStrategyRow) : null
}

/**
 * Inserts a snapshot that cannot be updated in place. Exact duplicates of
 * workspaceId + strategyId + inputsDigest + linkId return the existing row.
 * Same strategyId with a different identity/digest fails closed.
 * There is no updateShadowStrategy() or deleteShadowStrategy(); parent
 * workspace / social account CASCADE DELETE is the only cleanup path.
 */
export async function insertShadowStrategy(
  supabase: SupabaseClient,
  strategy: ShadowGrowthStrategy,
  importedBy: string,
): Promise<{ strategy: ShadowGrowthStrategy; created: boolean }> {
  const existing = await findShadowStrategyByStrategyId(supabase, strategy.workspaceId, strategy.strategyId)
  if (existing) {
    if (isExactDuplicate(existing, strategy) && !isConflictingStrategy(existing, strategy)) {
      return { strategy: existing, created: false }
    }
    throw new ShadowStrategyConflictError()
  }

  const { data, error } = await supabase
    .from('shadow_growth_strategies')
    .insert(toInsertRow(strategy, importedBy))
    .select('*')
    .single()

  if (!error && data) {
    return { strategy: mapRow(data as ShadowGrowthStrategyRow), created: true }
  }
  if (error?.code !== '23505') {
    throw new Error(error?.message ?? 'Shadow Strategy を保存できませんでした。')
  }

  const raced = await findShadowStrategyByStrategyId(supabase, strategy.workspaceId, strategy.strategyId)
  if (raced && isExactDuplicate(raced, strategy) && !isConflictingStrategy(raced, strategy)) {
    return { strategy: raced, created: false }
  }
  throw new ShadowStrategyConflictError()
}

export function shadowStrategyAuditMetadata(strategy: ShadowGrowthStrategy): Record<string, unknown> {
  return {
    strategyId: strategy.strategyId,
    socialAccountId: strategy.socialAccountId,
    platform: strategy.platform,
    strategyVersion: strategy.strategyVersion,
    status: strategy.status,
    sampleSize: strategy.sampleSize,
    inputsDigest: strategy.inputsDigest,
  }
}
