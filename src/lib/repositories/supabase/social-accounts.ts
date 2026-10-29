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

/** Server/session-side durable read used to reconcile an RPC whose response may have been lost after commit. */
export async function getSocialAccountById(
  supabase: SupabaseClient,
  accountId: string,
): Promise<SocialAccount | null> {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapAccount(data as SocialAccountRow) : null
}

export interface UpsertPendingAccountInput {
  workspaceId: string
  platform: SocialPlatform
  handle: string
  externalAccountId?: string
}

/**
 * Creates a separate pending row for every OAuth attempt. Reusing the existing
 * live row would set connected=false before the new credential is durable and
 * could take a perfectly working account offline when reconnect fails.
 *
 * finalizeSocialAccountConnection() performs the eventual old→new swap in one
 * DB transaction after encrypted credentials have been stored.
 */
export async function upsertPendingSocialAccount(
  supabase: SupabaseClient,
  input: UpsertPendingAccountInput,
): Promise<SocialAccount> {
  const { data, error } = await supabase
    .from('social_accounts')
    .insert({
      workspace_id: input.workspaceId,
      platform: input.platform,
      handle: input.handle,
      external_account_id: input.externalAccountId ?? null,
      connected: false,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAccount(data as SocialAccountRow)
}

/**
 * Atomically activates this credential-backed pending account. A second
 * account on the same platform stays connected; reconnecting the same
 * external id still retires that previous row. Webhook platforms keep one
 * workspace owner per real account.
 */
export async function finalizeSocialAccountConnection(
  supabase: SupabaseClient,
  accountId: string,
): Promise<SocialAccount> {
  const { data, error } = await supabase.rpc('finalize_social_account_connection', {
    p_account_id: accountId,
  })

  if (error || !data) throw new Error(error?.message ?? 'SNSアカウントの接続を確定できませんでした。')
  return mapAccount(data as unknown as SocialAccountRow)
}

/** Remove a failed OAuth attempt without ever touching a live connection. */
export async function deletePendingSocialAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<void> {
  const { error } = await supabase
    .from('social_accounts')
    .delete()
    .eq('id', accountId)
    .eq('connected', false)

  if (error) throw new Error(error.message)
}
