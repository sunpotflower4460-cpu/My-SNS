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
