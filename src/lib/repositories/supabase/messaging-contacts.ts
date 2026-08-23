import type { MessagingContact } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface MessagingContactRow {
  id: string
  workspace_id: string
  platform: MessagingContact['platform']
  external_contact_id: string
  display_name: string | null
  avatar_url: string | null
  timezone: string | null
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  priority_hint: MessagingContact['priorityHint'] | null
  auto_send_enabled: boolean
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export function mapMessagingContact(row: MessagingContactRow): MessagingContact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    externalContactId: row.external_contact_id,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    timezone: row.timezone ?? undefined,
    quietHoursStart: row.quiet_hours_start ?? undefined,
    quietHoursEnd: row.quiet_hours_end ?? undefined,
    priorityHint: row.priority_hint ?? undefined,
    autoSendEnabled: row.auto_send_enabled ?? false,
    lastMessageAt: row.last_message_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listWorkspaceMessagingContacts(workspaceId: string): Promise<MessagingContact[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('messaging_contacts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) {
    throw new Error(`メッセージ連絡先と自動送信設定を読み込めませんでした。空の連絡先として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((row) => mapMessagingContact(row as MessagingContactRow))
}

/**
 * Flips a contact's auto-send opt-in. Uses the browser client — RLS restricts
 * messaging_contacts UPDATE to owner/admin/editor, so a viewer/contributor's
 * toggle matches zero rows and throws. Nothing is sent by this call; it only
 * records the preference the auto-reply sweep later honors.
 */
export async function setContactAutoSend(workspaceId: string, contactId: string, enabled: boolean): Promise<MessagingContact> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('messaging_contacts')
    .update({ auto_send_enabled: enabled })
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('この連絡先の自動送信設定を変更できませんでした（権限がないか、連絡先が見つかりません）。')

  return mapMessagingContact(data as MessagingContactRow)
}
