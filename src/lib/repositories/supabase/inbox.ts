import type { InboxItem, InboxNote } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export async function listWorkspaceInbox(workspaceId: string): Promise<InboxItem[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('inbox_items')
    .select(`
      *,
      relatedContent:contents(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('received_at', { ascending: false })

  if (error) {
    console.error('Error fetching inbox:', error)
    return []
  }

  return (data || []).map((item) => {
    const relatedContent = Array.isArray(item.relatedContent)
      ? item.relatedContent[0]
      : item.relatedContent

    return {
      id: item.id,
      workspaceId: item.workspace_id,
      platform: item.platform,
      kind: item.kind,
      authorHandle: item.author_handle,
      authorAvatarUrl: item.author_avatar_url,
      text: item.text,
      contentId: item.content_id,
      receivedAt: item.received_at,
      isRead: item.is_read,
      needsAction: item.needs_action,
      isStarred: item.is_starred,
      aiSummary: item.ai_summary,
      relatedContent: relatedContent ? {
        id: relatedContent.id,
        workspaceId: relatedContent.workspace_id,
        title: relatedContent.title,
        body: relatedContent.body,
        type: relatedContent.type,
        status: relatedContent.status,
        tags: relatedContent.tags || [],
        authorId: relatedContent.author_id,
        createdAt: relatedContent.created_at,
        updatedAt: relatedContent.updated_at,
      } : undefined,
    }
  })
}

export async function updateInboxItem(
  workspaceId: string,
  inboxItemId: string,
  patch: Partial<Pick<InboxItem, 'isRead' | 'needsAction' | 'isStarred'>>
): Promise<InboxItem> {
  const supabase = createClient()

  const updates: Record<string, unknown> = {}
  if (patch.isRead !== undefined) updates.is_read = patch.isRead
  if (patch.needsAction !== undefined) updates.needs_action = patch.needsAction
  if (patch.isStarred !== undefined) updates.is_starred = patch.isStarred

  const { data, error } = await supabase
    .from('inbox_items')
    .update(updates)
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    platform: data.platform,
    kind: data.kind,
    authorHandle: data.author_handle,
    authorAvatarUrl: data.author_avatar_url,
    text: data.text,
    contentId: data.content_id,
    receivedAt: data.received_at,
    isRead: data.is_read,
    needsAction: data.needs_action,
    isStarred: data.is_starred,
    aiSummary: data.ai_summary,
  }
}

export async function listInboxNotes(
  _workspaceId: string,
  inboxItemId: string
): Promise<InboxNote[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('inbox_notes')
    .select('*')
    .eq('inbox_item_id', inboxItemId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching inbox notes:', error)
    return []
  }

  return (data || []).map((n) => ({
    id: n.id,
    inboxItemId: n.inbox_item_id,
    authorId: n.author_id,
    text: n.text,
    createdAt: n.created_at,
  }))
}

export async function listWorkspaceInboxNotes(workspaceId: string): Promise<InboxNote[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('inbox_notes')
    .select('*, inbox_item:inbox_items!inner(workspace_id)')
    .eq('inbox_item.workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching workspace inbox notes:', error)
    return []
  }

  return (data || []).map((note) => ({
    id: note.id,
    inboxItemId: note.inbox_item_id,
    authorId: note.author_id,
    text: note.text,
    createdAt: note.created_at,
  }))
}

export async function addInboxNote(params: {
  workspaceId: string
  inboxItemId: string
  authorId: string
  text: string
}): Promise<InboxNote> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('inbox_notes')
    .insert({
      inbox_item_id: params.inboxItemId,
      author_id: params.authorId,
      text: params.text,
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return {
    id: data.id,
    inboxItemId: data.inbox_item_id,
    authorId: data.author_id,
    text: data.text,
    createdAt: data.created_at,
  }
}
