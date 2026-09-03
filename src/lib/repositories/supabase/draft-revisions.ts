import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftRevision, DraftSource, PublishingChannel } from '@/lib/domain/types'
import type { DraftStyleExample } from '@/lib/services/interfaces'
import { keepFactualAssumptions } from '@/lib/services/draft-assumptions'
import {
  buildDraftStyleExamples,
  STYLE_LEARNING_LIMIT_PER_CHANNEL,
} from '@/lib/services/draft-style-learning'
import { createClient } from '@/lib/supabase/client'

export { wasRevisionEditedByHuman } from '@/lib/services/draft-style-learning'

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
  ai_original_snapshot?: DraftRevision['aiOriginalSnapshot'] | null
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
    assumptions: keepFactualAssumptions(row.assumptions),
    metadata: row.metadata ?? {},
    source: row.source,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    aiOriginalSnapshot: row.ai_original_snapshot ?? undefined,
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

/** The most recent approval for a draft — the content a new publish_job should schedule. */
export async function getLatestDraftRevision(workspaceId: string, socialDraftId: string): Promise<DraftRevision | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('draft_revisions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('social_draft_id', socialDraftId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`承認版（Revision）を読み込めませんでした。存在しないものとして扱わず、再読み込みしてください: ${error.message}`)
  }

  return data ? mapRevision(data as DraftRevisionRow) : null
}

export async function getDraftRevisionById(workspaceId: string, revisionId: string): Promise<DraftRevision | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('draft_revisions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', revisionId)
    .maybeSingle()

  if (error) {
    throw new Error(`承認版（Revision）を読み込めませんでした。存在しないものとして扱わず、再読み込みしてください: ${error.message}`)
  }

  return data ? mapRevision(data as DraftRevisionRow) : null
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
    throw new Error(`承認版一覧を読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((row) => mapRevision(row as DraftRevisionRow))
}

// See WORKSPACE_PUBLISH_ATTEMPTS_LIMIT's comment in publish-attempts.ts —
// same reasoning, exported for the same truncation-labeling purpose.
export const WORKSPACE_DRAFT_REVISIONS_LIMIT = 1000

export async function listWorkspaceDraftRevisions(workspaceId: string, limit = WORKSPACE_DRAFT_REVISIONS_LIMIT): Promise<DraftRevision[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('draft_revisions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`承認版一覧を読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((row) => mapRevision(row as DraftRevisionRow))
}

/**
 * Recent AI proposals a human actually edited before approving, for the
 * given channels — passed into the next generation call as few-shot style
 * examples (PR7's "learn from corrections"). Server-only: takes an explicit
 * client because it's called from /api/drafts/generate's request-scoped
 * server client, not the browser client the rest of this file uses.
 */
export async function listRecentAiRevisionsForStyleLearning(
  supabase: SupabaseClient,
  workspaceId: string,
  channels: PublishingChannel[],
  limitPerChannel = STYLE_LEARNING_LIMIT_PER_CHANNEL,
): Promise<DraftStyleExample[]> {
  if (channels.length === 0) return []

  const { data, error } = await supabase
    .from('draft_revisions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('source', 'ai')
    .in('channel', channels)
    .not('ai_original_snapshot', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`スタイル学習用の下書き履歴を読み込めませんでした: ${error.message}`)
  }

  return buildDraftStyleExamples((data ?? []).map((row) => mapRevision(row as DraftRevisionRow)), limitPerChannel)
}
