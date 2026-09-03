import type { DraftSource, SocialDraft } from '@/lib/domain/types'
import { keepFactualAssumptions } from '@/lib/services/draft-assumptions'
import { snapshotForFirstAiSave } from '@/lib/services/draft-style-learning'
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
  ai_original_snapshot?: SocialDraft['aiOriginalSnapshot'] | null
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
    assumptions: keepFactualAssumptions(row.assumptions),
    metadata: row.metadata ?? {},
    source: row.source,
    tone: row.tone,
    length: row.length,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aiOriginalSnapshot: row.ai_original_snapshot ?? undefined,
  }
}

function draftsReadError(scope: string, message: string): Error {
  return new Error(`${scope}を読み込めませんでした。空の下書きとして扱わず、再読み込みしてください: ${message}`)
}

export async function listWorkspaceDrafts(workspaceId: string): Promise<SocialDraft[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_drafts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) throw draftsReadError('下書き', error.message)

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

  if (error) throw draftsReadError('このシードの下書き', error.message)

  return (data ?? []).map((row) => mapDraft(row as SocialDraftRow))
}

export async function getSocialDraft(workspaceId: string, draftId: string): Promise<SocialDraft | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_drafts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', draftId)
    .maybeSingle()

  if (error) throw draftsReadError('下書き', error.message)
  return data ? mapDraft(data as SocialDraftRow) : null
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

  // ai_original_snapshot is deliberately set only on first INSERT, never on
  // a later UPDATE. Prefer the generation-time copy when the client still
  // has it, so a pre-save edit is not frozen as "AI original".
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
          ai_original_snapshot: snapshotForFirstAiSave(draft),
        })

  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)

  return mapDraft(data as SocialDraftRow)
}
