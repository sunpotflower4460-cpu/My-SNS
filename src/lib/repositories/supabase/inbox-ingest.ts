import type { SupabaseClient } from '@supabase/supabase-js'
import type { InboundInboxEvent, SocialPlatform } from '@/lib/domain/types'

// Server-only, and only ever called with the service-role client —
// inbox_items has no INSERT policy for regular users (see the RLS comment
// "System can insert inbox items (through service role)"). Never import
// this from a client component.

export async function upsertInboxItems(
  supabase: SupabaseClient,
  workspaceId: string,
  events: InboundInboxEvent[],
): Promise<number> {
  if (events.length === 0) return 0

  const rows = events.map((event) => ({
    workspace_id: workspaceId,
    platform: event.platform,
    kind: event.kind,
    external_id: event.externalId,
    author_handle: event.authorHandle,
    author_avatar_url: event.authorAvatarUrl ?? null,
    text: event.text,
    received_at: event.receivedAt,
  }))

  // ignoreDuplicates + onConflict targets inbox_items_external_dedupe_idx
  // (see its migration — deliberately a plain, non-partial unique index:
  // PostgREST's onConflict can only emit a bare column list, so it cannot
  // target a partial index as the ON CONFLICT arbiter). The same platform
  // event delivered twice — a webhook retry, an overlapping manual sync —
  // produces exactly one row.
  const { data, error } = await supabase
    .from('inbox_items')
    .upsert(rows, { onConflict: 'workspace_id,platform,kind,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/** Which workspace owns a platform account, keyed by the platform's own account id — resolves an incoming webhook payload to a workspace. */
export async function resolveWorkspaceIdByExternalAccount(
  supabase: SupabaseClient,
  platform: SocialPlatform,
  externalAccountId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('workspace_id')
    .eq('platform', platform)
    .eq('external_account_id', externalAccountId)
    .eq('connected', true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.workspace_id ?? null
}
