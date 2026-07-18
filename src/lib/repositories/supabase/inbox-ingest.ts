import type { SupabaseClient } from '@supabase/supabase-js'
import type { InboundInboxEvent, SocialPlatform } from '@/lib/domain/types'

// Server-only, and only ever called with the service-role client —
// inbox_items has no INSERT policy for regular users (see the RLS comment
// "System can insert inbox items (through service role)"). Never import
// this from a client component.

/** Key one InboundInboxEvent's contact by platform + author, matching upsertMessagingContacts' map keys. */
function contactKey(platform: string, authorHandle: string): string {
  return `${platform}:${authorHandle}`
}

export async function upsertInboxItems(
  supabase: SupabaseClient,
  workspaceId: string,
  events: InboundInboxEvent[],
  contactIdByKey?: Map<string, string>,
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
    // Set on first insert only (ignoreDuplicates never updates an existing
    // row). undefined map / no match → null, preserving the pre-contacts path.
    contact_id: contactIdByKey?.get(contactKey(event.platform, event.authorHandle)) ?? null,
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

/**
 * Upserts one messaging_contacts row per distinct (platform, authorHandle)
 * among the events, bumping last_message_at, and returns a map from
 * `${platform}:${authorHandle}` to the contact id so the caller can link the
 * inbox rows. Service-role only (messaging_contacts has no user INSERT policy).
 * The upsert omits display_name/timezone/quiet_hours so a re-delivery never
 * clobbers user-set contact fields.
 */
export async function upsertMessagingContacts(
  supabase: SupabaseClient,
  workspaceId: string,
  events: InboundInboxEvent[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  // One row per contact, carrying the latest message time.
  const latestByKey = new Map<string, InboundInboxEvent>()
  for (const event of events) {
    const key = contactKey(event.platform, event.authorHandle)
    const existing = latestByKey.get(key)
    if (!existing || event.receivedAt > existing.receivedAt) latestByKey.set(key, event)
  }
  if (latestByKey.size === 0) return result

  const rows = Array.from(latestByKey.values()).map((event) => ({
    workspace_id: workspaceId,
    platform: event.platform,
    external_contact_id: event.authorHandle,
    last_message_at: event.receivedAt,
  }))

  const { data, error } = await supabase
    .from('messaging_contacts')
    .upsert(rows, { onConflict: 'workspace_id,platform,external_contact_id' })
    .select('id, platform, external_contact_id')

  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    result.set(contactKey(row.platform, row.external_contact_id), row.id)
  }
  return result
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
