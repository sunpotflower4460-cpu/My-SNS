import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftRevision, DraftSource, PublishingChannel } from '@/lib/domain/types'
import type { DraftStyleExample } from '@/lib/services/interfaces'
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
    assumptions: row.assumptions ?? [],
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
    console.error('Error fetching the latest draft revision:', error)
    return null
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
    console.error('Error fetching draft revision:', error)
    return null
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
    console.error('Error fetching draft revisions:', error)
    return []
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
    console.error('Error fetching workspace draft revisions:', error)
    return []
  }

  return (data ?? []).map((row) => mapRevision(row as DraftRevisionRow))
}

function sortedHashtags(hashtags: string[]): string {
  return [...hashtags].sort().join(',')
}

/** True when the approved content actually differs from what the AI originally proposed — false for template-sourced Revisions and anything approved unedited. Compares every field the snapshot carries, including hashtags (order-insensitive) — a hashtag-only correction is still a real, learnable edit. */
export function wasRevisionEditedByHuman(revision: DraftRevision): boolean {
  const snapshot = revision.aiOriginalSnapshot
  if (!snapshot) return false
  return (
    revision.body !== snapshot.body ||
    (revision.title ?? '') !== (snapshot.title ?? '') ||
    (revision.cta ?? '') !== (snapshot.cta ?? '') ||
    sortedHashtags(revision.hashtags) !== sortedHashtags(snapshot.hashtags)
  )
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
  limitPerChannel = 2,
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
    console.error('Error fetching revisions for style learning:', error)
    return []
  }

  const revisions = (data ?? []).map((row) => mapRevision(row as DraftRevisionRow))
  const examples: DraftStyleExample[] = []
  const countPerChannel = new Map<PublishingChannel, number>()

  for (const revision of revisions) {
    if (!revision.aiOriginalSnapshot || !wasRevisionEditedByHuman(revision)) continue
    const soFar = countPerChannel.get(revision.channel) ?? 0
    if (soFar >= limitPerChannel) continue

    examples.push({ channel: revision.channel, aiProposed: revision.aiOriginalSnapshot.body, humanApproved: revision.body })
    countPerChannel.set(revision.channel, soFar + 1)
  }

  return examples
}
