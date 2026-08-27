import type { SupabaseClient } from '@supabase/supabase-js'

// Token endpoints are expected to be short-lived network calls. Two minutes is
// deliberately much longer than a normal refresh but short enough that a
// serverless hard-kill does not block credential use for an entire session.
const STALE_REFRESH_CLAIM_MINUTES = 2

function staleBeforeIso(): string {
  return new Date(Date.now() - STALE_REFRESH_CLAIM_MINUTES * 60_000).toISOString()
}

export async function claimSocialCredentialRefresh(
  supabase: SupabaseClient,
  socialAccountId: string,
): Promise<string | null> {
  const claimToken = crypto.randomUUID()
  const claimedAt = new Date().toISOString()

  const { error: insertError } = await supabase.from('social_credential_refresh_claims').insert({
    social_account_id: socialAccountId,
    claim_token: claimToken,
    claimed_at: claimedAt,
  })

  if (!insertError) return claimToken
  if (insertError.code !== '23505') throw new Error(insertError.message)

  const { data, error: reclaimError } = await supabase
    .from('social_credential_refresh_claims')
    .update({ claim_token: claimToken, claimed_at: claimedAt })
    .eq('social_account_id', socialAccountId)
    .lt('claimed_at', staleBeforeIso())
    .select('social_account_id')
    .maybeSingle()

  if (reclaimError) throw new Error(reclaimError.message)
  return data ? claimToken : null
}

export async function releaseSocialCredentialRefresh(
  supabase: SupabaseClient,
  socialAccountId: string,
  claimToken: string,
): Promise<void> {
  const { error } = await supabase
    .from('social_credential_refresh_claims')
    .delete()
    .eq('social_account_id', socialAccountId)
    .eq('claim_token', claimToken)

  if (error) throw new Error(error.message)
}
