import type { SupabaseClient } from '@supabase/supabase-js'
import type { SocialPlatform } from '@/lib/domain/types'

// Server-only (called from the connect/callback routes with the requesting
// user's own session-scoped Supabase client, so RLS's created_by=auth.uid()
// check applies naturally).

const STATE_TTL_MINUTES = 10

export interface CreateOAuthStateInput {
  workspaceId: string
  platform: SocialPlatform
  state: string
  codeVerifier?: string
  createdBy: string
}

export async function createOAuthState(supabase: SupabaseClient, input: CreateOAuthStateInput): Promise<void> {
  const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60_000).toISOString()

  const { error } = await supabase.from('oauth_states').insert({
    workspace_id: input.workspaceId,
    platform: input.platform,
    state: input.state,
    code_verifier: input.codeVerifier ?? null,
    created_by: input.createdBy,
    expires_at: expiresAt,
  })

  if (error) throw new Error(error.message)
}

export interface ConsumedOAuthState {
  workspaceId: string
  platform: SocialPlatform
  codeVerifier?: string
}

/** Reads and immediately deletes the state row — a state can only ever be consumed once. */
export async function consumeOAuthState(supabase: SupabaseClient, state: string): Promise<ConsumedOAuthState | null> {
  const { data, error } = await supabase
    .from('oauth_states')
    .select('workspace_id, platform, code_verifier, expires_at')
    .eq('state', state)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  await supabase.from('oauth_states').delete().eq('state', state)

  if (new Date(data.expires_at).getTime() < Date.now()) return null

  return {
    workspaceId: data.workspace_id,
    platform: data.platform,
    codeVerifier: data.code_verifier ?? undefined,
  }
}
