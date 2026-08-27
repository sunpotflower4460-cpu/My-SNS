import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiGeneration, PublishingChannel } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface AiGenerationRow {
  id: string
  workspace_id: string
  seed_id: string | null
  inbox_item_id: string | null
  purpose: 'draft' | 'reply' | 'schedule'
  channels: PublishingChannel[]
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_by: string
  created_at: string
}

function mapGeneration(row: AiGenerationRow): AiGeneration {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seedId: row.seed_id ?? undefined,
    inboxItemId: row.inbox_item_id ?? undefined,
    purpose: row.purpose,
    channels: row.channels,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export interface RecordAiGenerationInput {
  /**
   * Optional caller-owned idempotency key. AI routes generate this UUID before
   * the billable model call. If the INSERT commits but its HTTP response is
   * lost, recordAiGeneration can re-read the same durable row instead of
   * treating a paid generation as failed (or inserting a second ledger row).
   */
  id?: string
  workspaceId: string
  /** Set for draft generations; a reply generation passes inboxItemId + purpose:'reply' instead. */
  seedId?: string
  inboxItemId?: string
  purpose?: 'draft' | 'reply' | 'schedule'
  channels: PublishingChannel[]
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  createdBy: string
}

async function findGenerationById(supabase: SupabaseClient, id: string): Promise<AiGeneration | null> {
  const { data, error } = await supabase
    .from('ai_generations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapGeneration(data as AiGenerationRow) : null
}

/**
 * Records one real AI generation call for cost/usage tracking — drafts (keyed
 * by seedId) and DM replies (keyed by inboxItemId, purpose:'reply') share one
 * ledger and one monthly budget sum. Never called for template fallbacks.
 *
 * With `input.id`, a failed INSERT response is reconciled by reading that same
 * UUID. This handles the distributed-systems case where PostgreSQL committed
 * the row but the HTTP response was lost, without duplicating usage/cost.
 */
export async function recordAiGeneration(
  supabase: SupabaseClient,
  input: RecordAiGenerationInput,
): Promise<AiGeneration> {
  const { data, error } = await supabase
    .from('ai_generations')
    .insert({
      ...(input.id ? { id: input.id } : {}),
      workspace_id: input.workspaceId,
      seed_id: input.seedId ?? null,
      inbox_item_id: input.inboxItemId ?? null,
      purpose: input.purpose ?? 'draft',
      channels: input.channels,
      model: input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
      created_by: input.createdBy,
    })
    .select()
    .single()

  if (!error) return mapGeneration(data as AiGenerationRow)

  if (input.id) {
    // The write may have committed even though PostgREST/network returned an
    // error to this request. Reconcile the exact caller-owned id before ever
    // reporting that a paid model call has no ledger row.
    try {
      const reconciled = await findGenerationById(supabase, input.id)
      if (reconciled) return reconciled
    } catch (reconcileCause) {
      const detail = reconcileCause instanceof Error ? reconcileCause.message : 'unknown reconciliation error'
      throw new Error(`${error.message} (AI usage reconciliation also failed: ${detail})`)
    }
  }

  throw new Error(error.message)
}

// See WORKSPACE_PUBLISH_ATTEMPTS_LIMIT's comment in publish-attempts.ts —
// same reasoning, exported for the same truncation-labeling purpose.
export const WORKSPACE_AI_GENERATIONS_LIMIT = 2000

/** For the Analytics page (PR7): total AI cost/usage, and how it breaks down by model/channel. */
export async function listWorkspaceAiGenerations(workspaceId: string, limit = WORKSPACE_AI_GENERATIONS_LIMIT): Promise<AiGeneration[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('ai_generations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`AI利用履歴を読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((row) => mapGeneration(row as AiGenerationRow))
}

/**
 * Sum of `cost_usd` for this workspace since the start of the current calendar
 * month in UTC. Only sums rows already recorded — exact call cost is known only
 * after Anthropic returns usage, so the configured cap can prevent the next
 * call after the limit is reached but cannot predict a single call's final cost.
 *
 * Uses a SQL aggregate so PostgREST row caps cannot silently undercount spend
 * and fail-open the monthly budget.
 */
export async function getWorkspaceMonthlyAiCost(supabase: SupabaseClient, workspaceId: string): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data, error } = await supabase
    .from('ai_generations')
    .select('cost_usd.sum()')
    .eq('workspace_id', workspaceId)
    .gte('created_at', startOfMonth)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const sum = (data as { sum?: number | string | null } | null)?.sum
  const numeric = typeof sum === 'number' ? sum : Number(sum ?? 0)
  if (!Number.isFinite(numeric)) {
    throw new Error('AI monthly cost aggregate returned a non-numeric value')
  }
  return numeric
}
