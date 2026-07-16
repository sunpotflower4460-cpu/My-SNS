import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiGeneration, PublishingChannel } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface AiGenerationRow {
  id: string
  workspace_id: string
  seed_id: string
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
    seedId: row.seed_id,
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
  workspaceId: string
  seedId: string
  channels: PublishingChannel[]
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  createdBy: string
}

/**
 * Records one real AI generation call for cost/usage tracking. Requires a
 * caller-provided Supabase client (the API route's authenticated server
 * client) — this is never called for template fallbacks, which cost nothing.
 */
export async function recordAiGeneration(
  supabase: SupabaseClient,
  input: RecordAiGenerationInput,
): Promise<AiGeneration> {
  const { data, error } = await supabase
    .from('ai_generations')
    .insert({
      workspace_id: input.workspaceId,
      seed_id: input.seedId,
      channels: input.channels,
      model: input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
      created_by: input.createdBy,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapGeneration(data as AiGenerationRow)
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
    console.error('Error fetching AI generations:', error)
    return []
  }

  return (data ?? []).map((row) => mapGeneration(row as AiGenerationRow))
}

/**
 * Sum of `cost_usd` for this workspace since the start of the current
 * calendar month in UTC (not server local time — `created_at` is a
 * TIMESTAMPTZ, an instant, so UTC is the only unambiguous boundary; do not
 * "fix" this to use local getFullYear()/getMonth(), which would make the
 * budget boundary silently depend on the deploying server's timezone) — the
 * basis for PR9's optional
 * `ANTHROPIC_MONTHLY_BUDGET_USD` cap. Takes an explicit client because it's
 * called from /api/drafts/generate's request-scoped server client, before
 * the Anthropic call itself, not the browser client the rest of this file
 * uses. Only sums rows already recorded — cannot know this-call's cost in
 * advance, so it can only block the *next* call once the cap is already met,
 * not predict whether one specific call will cross it mid-flight.
 */
export async function getWorkspaceMonthlyAiCost(supabase: SupabaseClient, workspaceId: string): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data, error } = await supabase
    .from('ai_generations')
    .select('cost_usd')
    .eq('workspace_id', workspaceId)
    .gte('created_at', startOfMonth)

  if (error) throw new Error(error.message)
  return (data ?? []).reduce((sum, row) => sum + Number((row as { cost_usd: number }).cost_usd ?? 0), 0)
}
