import type { SupabaseClient } from '@supabase/supabase-js'
import type { Notification, NotificationType } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface NotificationRow {
  id: string
  workspace_id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  target_type: string | null
  target_id: string | null
  is_read: boolean
  created_at: string
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body ?? undefined,
    targetType: row.target_type ?? undefined,
    targetId: row.target_id ?? undefined,
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}

export async function listMyNotifications(workspaceId: string, limit = 50): Promise<Notification[]> {
  const supabase = createClient()

  // RLS already scopes this to the caller's own rows (user_id = auth.uid());
  // the workspace_id filter here is so a workspace switch doesn't show a
  // notification from a different workspace mixed into this one's list.
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching notifications:', error)
    return []
  }

  return (data ?? []).map((row) => mapNotification(row as NotificationRow))
}

export interface CreateNotificationInput {
  workspaceId: string
  userId: string
  type: NotificationType
  title: string
  body?: string
  targetType?: string
  targetId?: string
}

/**
 * Fans a notification out to several recipients at once (e.g. every
 * approver on a workspace). Takes an explicit client so it can run from
 * either a browser-triggered action (the acting user's own client — see the
 * INSERT policy's "any workspace member can notify a teammate" comment) or
 * the service-role client (the publish Worker, notifying about a failure it
 * observed with no end user in the request).
 */
export async function createNotifications(supabase: SupabaseClient, inputs: CreateNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return

  const { error } = await supabase.from('notifications').insert(
    inputs.map((input) => ({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
    })),
  )

  if (error) throw new Error(error.message)
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead(workspaceId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('workspace_id', workspaceId)
    .eq('is_read', false)
  if (error) throw new Error(error.message)
}
