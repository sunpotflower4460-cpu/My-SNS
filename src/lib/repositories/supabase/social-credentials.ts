import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from '@/lib/crypto/token-cipher'

// Server-only, and only ever called with the service-role client — see
// social_account_credentials' RLS comment. Never import this from a client
// component.

export interface StoredCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scopes: string[]
}

interface CredentialsRow {
  encrypted_access_token: string
  encrypted_refresh_token: string | null
  token_expires_at: string | null
  scopes: string[]
}

export async function saveSocialCredentials(
  supabase: SupabaseClient,
  socialAccountId: string,
  credentials: StoredCredentials,
): Promise<void> {
  const { error } = await supabase
    .from('social_account_credentials')
    .upsert(
      {
        social_account_id: socialAccountId,
        encrypted_access_token: encryptToken(credentials.accessToken),
        encrypted_refresh_token: credentials.refreshToken ? encryptToken(credentials.refreshToken) : null,
        token_expires_at: credentials.expiresAt ?? null,
        scopes: credentials.scopes,
      },
      { onConflict: 'social_account_id' },
    )

  if (error) throw new Error(error.message)
}

export async function getSocialCredentials(
  supabase: SupabaseClient,
  socialAccountId: string,
): Promise<StoredCredentials | null> {
  const { data, error } = await supabase
    .from('social_account_credentials')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at, scopes')
    .eq('social_account_id', socialAccountId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const row = data as CredentialsRow
  return {
    accessToken: decryptToken(row.encrypted_access_token),
    refreshToken: row.encrypted_refresh_token ? decryptToken(row.encrypted_refresh_token) : undefined,
    expiresAt: row.token_expires_at ?? undefined,
    scopes: row.scopes,
  }
}

export async function deleteSocialCredentials(supabase: SupabaseClient, socialAccountId: string): Promise<void> {
  const { error } = await supabase
    .from('social_account_credentials')
    .delete()
    .eq('social_account_id', socialAccountId)

  if (error) throw new Error(error.message)
}
