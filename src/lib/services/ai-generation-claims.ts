import type { SupabaseClient } from '@supabase/supabase-js'

const STALE_CLAIM_MINUTES = 10

function staleBeforeIso(): string {
  return new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
}

function newClaimToken(): string {
  return crypto.randomUUID()
}

export function configuredMonthlyAiBudgetUsd(): number | null {
  const raw = Number(process.env.ANTHROPIC_MONTHLY_BUDGET_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

export async function claimWorkspaceAiBudget(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const claimToken = newClaimToken()
  const claimedAt = new Date().toISOString()

  const { error: insertError } = await supabase.from('ai_budget_claims').insert({
    workspace_id: workspaceId,
    claim_token: claimToken,
    claimed_at: claimedAt,
  })

  if (!insertError) return claimToken
  if (insertError.code !== '23505') throw new Error(insertError.message)

  const { data, error: reclaimError } = await supabase
    .from('ai_budget_claims')
    .update({ claim_token: claimToken, claimed_at: claimedAt })
    .eq('workspace_id', workspaceId)
    .lt('claimed_at', staleBeforeIso())
    .select('workspace_id')
    .maybeSingle()

  if (reclaimError) throw new Error(reclaimError.message)
  return data ? claimToken : null
}

export async function releaseWorkspaceAiBudget(
  supabase: SupabaseClient,
  workspaceId: string,
  claimToken: string,
): Promise<void> {
  const { error } = await supabase
    .from('ai_budget_claims')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('claim_token', claimToken)

  if (error) throw new Error(error.message)
}

export async function claimInboxReplyGeneration(
  supabase: SupabaseClient,
  workspaceId: string,
  inboxItemId: string,
): Promise<string | null> {
  const claimToken = newClaimToken()
  const claimedAt = new Date().toISOString()

  const { error: insertError } = await supabase.from('ai_reply_generation_claims').insert({
    workspace_id: workspaceId,
    inbox_item_id: inboxItemId,
    claim_token: claimToken,
    claimed_at: claimedAt,
  })

  if (!insertError) return claimToken
  if (insertError.code !== '23505') throw new Error(insertError.message)

  const { data, error: reclaimError } = await supabase
    .from('ai_reply_generation_claims')
    .update({ workspace_id: workspaceId, claim_token: claimToken, claimed_at: claimedAt })
    .eq('inbox_item_id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .lt('claimed_at', staleBeforeIso())
    .select('inbox_item_id')
    .maybeSingle()

  if (reclaimError) throw new Error(reclaimError.message)
  return data ? claimToken : null
}

export async function releaseInboxReplyGeneration(
  supabase: SupabaseClient,
  workspaceId: string,
  inboxItemId: string,
  claimToken: string,
): Promise<void> {
  const { error } = await supabase
    .from('ai_reply_generation_claims')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('inbox_item_id', inboxItemId)
    .eq('claim_token', claimToken)

  if (error) throw new Error(error.message)
}
