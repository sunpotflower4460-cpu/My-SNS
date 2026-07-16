import type { DraftRevision, DraftSource, PublishingChannel } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface DraftRevisionRow {
  id: string
  workspace_id: string
  seed_id: string
  social_draft_id: string
  ai_generation_id?: string | null
  channel: PublishingChannel
  title?: string | null
  body: string
  hashtags?: string[] | null
  cta?: string | null
  assumptions?: string[] | null
  metadata?: Record<string, unknown> | null
  source: DraftSource
  approved_by: string
  created_at: string
}

function mapRevision(row: DraftRevisionRow): DraftRevision {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seedId: row.seed_id,
    socialDraftId: row.social_draft_id,
    aiGenerationId: row.ai_generation_id ?? undefined,
    channel: row.channel,
    title: row.title ?? undefined,
    body: row.body,
    hashtags: row.hashtags ?? [],
    cta: row.cta ?? undefined,
    assumptions: row.assumptions ?? [],
    metadata: row.metadata ?? {},
    source: row.source,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  }
}

/**
 * Approves a draft and writes its Revision snapshot atomically via the
 * `approve_social_draft` Postgres function: one round trip, one transaction.
 * If the caller's role cannot approve (enforced by a trigger on
 * social_drafts, mirrored by the draft_revisions INSERT policy) or the
 * insert fails for any other reason, the status change itself rolls back —
 * a draft can never end up "approved" with no Revision.
 */
export async function approveSocialDraft(draftId: string): Promise<DraftRevision> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('approve_social_draft', { p_draft_id: draftId })
  if (error) throw new Error(error.message)

  return mapRevision(data as DraftRevisionRow)
}

export async function listSeedRevisions(workspaceId: string, seedId: string): Promise<DraftRevision[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('draft_revisions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('seed_id', seedId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching draft revisions:', error)
    return []
  }

  return (data ?? []).map((row) => mapRevision(row as DraftRevisionRow))
}
