import type { DraftSource, SocialDraft } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface SocialDraftRow {
  id: string
  workspace_id: string
  seed_id: string
  channel: SocialDraft['channel']
  title?: string | null
  draft_text: string
  hashtags?: string[] | null
  cta?: string | null
  assumptions?: string[] | null
  metadata?: Record<string, unknown> | null
  source: DraftSource
  tone: string
  length: SocialDraft['length']
  status: SocialDraft['status']
  created_by: string
  created_at: string
  updated_at: string
}

function mapDraft(row: SocialDraftRow): SocialDraft {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seedId: row.seed_id,
    channel: row.channel,
    title: row.title ?? undefined,
    draftText: row.draft_text,
    hashtags: row.hashtags ?? [],
    cta: row.cta ?? undefined,
    assumptions: row.assumptions ?? [],
    metadata: row.metadata ?? {},
    source: row.source,
    tone: row.tone,
    length: row.length,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

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

  return (data ?? []).map((row) => mapDraft(row as SocialDraftRow))
}

export async function listSeedDrafts(
  workspaceId: string,
  seedId: string
): Promise<SocialDraft[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_drafts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('seed_id', seedId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching Seed drafts:', error)
    return []
  }

  return (data ?? []).map((row) => mapDraft(row as SocialDraftRow))
}

export async function upsertSocialDraft(
  workspaceId: string,
  draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<SocialDraft> {
  const supabase = createClient()

  const values = {
    draft_text: draft.draftText,
    title: draft.title?.trim() || null,
    hashtags: draft.hashtags,
    cta: draft.cta?.trim() || null,
    assumptions: draft.assumptions,
    metadata: draft.metadata,
    source: draft.source,
    tone: draft.tone,
    length: draft.length,
    status: draft.status,
  }

  const query = draft.id
    ? supabase
        .from('social_drafts')
        .update(values)
        .eq('id', draft.id)
        .eq('workspace_id', workspaceId)
    : supabase
        .from('social_drafts')
        .insert({
          ...values,
          workspace_id: draft.workspaceId,
          seed_id: draft.seedId,
          channel: draft.channel,
          created_by: draft.createdBy,
        })

  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)

  return mapDraft(data as SocialDraftRow)
}
