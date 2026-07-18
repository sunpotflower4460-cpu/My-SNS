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
    console.error('Error fetching messaging contacts:', error)
    return []
  }

  return (data ?? []).map((row) => mapMessagingContact(row as MessagingContactRow))
}
