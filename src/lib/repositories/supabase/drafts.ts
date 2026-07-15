import type { SocialDraft } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export async function listWorkspaceDrafts(workspaceId: string): Promise<SocialDraft[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_drafts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching drafts:', error)
    return []
  }

  return (data || []).map((d) => ({
    id: d.id,
    workspaceId: d.workspace_id,
    contentId: d.content_id,
    platform: d.platform,
    draftText: d.draft_text,
    tone: d.tone,
    length: d.length,
    status: d.status,
    createdBy: d.created_by,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }))
}

export async function listContentDrafts(
  workspaceId: string,
  contentId: string
): Promise<SocialDraft[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_drafts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('content_id', contentId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching content drafts:', error)
    return []
  }

  return (data || []).map((d) => ({
    id: d.id,
    workspaceId: d.workspace_id,
    contentId: d.content_id,
    platform: d.platform,
    draftText: d.draft_text,
    tone: d.tone,
    length: d.length,
    status: d.status,
    createdBy: d.created_by,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }))
}

export async function upsertSocialDraft(
  workspaceId: string,
  draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<SocialDraft> {
  const supabase = createClient()

  if (draft.id) {
    // Update existing
    const { data, error } = await supabase
      .from('social_drafts')
      .update({
        draft_text: draft.draftText,
        tone: draft.tone,
        length: draft.length,
        status: draft.status,
      })
      .eq('id', draft.id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      contentId: data.content_id,
      platform: data.platform,
      draftText: data.draft_text,
      tone: data.tone,
      length: data.length,
      status: data.status,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  } else {
    // Create new
    const { data, error } = await supabase
      .from('social_drafts')
      .insert({
        workspace_id: draft.workspaceId,
        content_id: draft.contentId,
        platform: draft.platform,
        draft_text: draft.draftText,
        tone: draft.tone,
        length: draft.length,
        status: draft.status,
        created_by: draft.createdBy,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      contentId: data.content_id,
      platform: data.platform,
      draftText: data.draft_text,
      tone: data.tone,
      length: data.length,
      status: data.status,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }
}
