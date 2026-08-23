import type { SupabaseClient } from '@supabase/supabase-js'
import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface SocialAccountRow {
  id: string
  workspace_id: string
  platform: SocialPlatform
  handle: string
  connected: boolean
  connected_at: string | null
  external_account_id: string | null
  updated_at: string
}

function mapAccount(row: SocialAccountRow): SocialAccount {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    handle: row.handle,
    connected: row.connected,
    connectedAt: row.connected_at ?? undefined,
    externalAccountId: row.external_account_id ?? undefined,
    updatedAt: row.updated_at,
  }
}

export async function listWorkspaceSocialAccounts(workspaceId: string): Promise<SocialAccount[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`SNS接続状態を読み込めませんでした。未接続として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((row) => mapAccount(row as SocialAccountRow))
}

export interface UpsertPendingAccountInput {
  workspaceId: string
  platform: SocialPlatform
  handle: string
  externalAccountId?: string
}

/**
 * Called from the OAuth callback route with the connecting user's own
 * session-scoped client (RLS requires owner/admin, matching manage_social_accounts).
 *
 * Deliberately upserts with connected=false — the row is created (so its id
 * exists for the credentials FK) but not marked connected yet. The callback
 * route only flips it to connected via finalizeSocialAccountConnection()
 * after the encrypted credential save succeeds, so a failure in between
 * can never leave Settings claiming "Connected" with no working token.
 */
export async function upsertPendingSocialAccount(
  supabase: SupabaseClient,
  input: UpsertPendingAccountInput,
): Promise<SocialAccount> {
  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(
      {
        workspace_id: input.workspaceId,
        platform: input.platform,
        handle: input.handle,
        external_account_id: input.externalAccountId ?? null,
        connected: false,
      },
      { onConflict: 'workspace_id,platform,handle' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAccount(data as SocialAccountRow)
}

export async function finalizeSocialAccountConnection(
  supabase: SupabaseClient,
  accountId: string,
): Promise<SocialAccount> {
  const { data, error } = await supabase
    .from('social_accounts')
    .update({ connected: true, connected_at: new Date().toISOString() })
    .eq('id', accountId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAccount(data as SocialAccountRow)
}
