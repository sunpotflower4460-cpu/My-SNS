import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreatorStatus, CreatorStatusInput } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface CreatorStatusRow {
  id: string
  workspace_id: string
  user_id: string
  mood: string
  note: string | null
  share_with_contacts: boolean
  updated_at: string
}

export function mapCreatorStatus(row: CreatorStatusRow): CreatorStatus {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    mood: row.mood,
    note: row.note ?? undefined,
    shareWithContacts: row.share_with_contacts,
    updatedAt: row.updated_at,
  }
}

/**
 * The caller's own status for a workspace, or null if unset. Takes an explicit
 * client so it works from the browser (RLS: own row) and from an API route (the
 * request-scoped server client, resolving auth.uid() to the same user).
 */
export async function getMyCreatorStatus(supabase: SupabaseClient, workspaceId: string, userId: string): Promise<CreatorStatus | null> {
  const { data, error } = await supabase
    .from('creator_status')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`クリエイター状態を読み込めませんでした。未設定として扱わず、再読み込みしてください: ${error.message}`)
  }

  return data ? mapCreatorStatus(data as CreatorStatusRow) : null
}

/** Upserts the caller's status (browser client — RLS pins user_id = auth.uid()). */
export async function upsertMyCreatorStatus(workspaceId: string, userId: string, input: CreatorStatusInput): Promise<CreatorStatus> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('creator_status')
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        mood: input.mood.trim(),
        note: input.note?.trim() || null,
        share_with_contacts: input.shareWithContacts,
      },
      { onConflict: 'workspace_id,user_id' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapCreatorStatus(data as CreatorStatusRow)
}
