import type { PublishJob, PublishMode } from '@/lib/domain/types'
import { getPublishingStrategy } from '@/lib/channels/config'
import { createClient } from '@/lib/supabase/client'

// A claim (see publish-worker.ts's claimPublishJob) older than this is
// treated as abandoned — e.g. a serverless function was killed mid-publish
// before it could clear its own claim. Without this, a job could be stuck.
const STALE_CLAIM_MINUTES = 10

function notActivelyClaimedFilter(): string {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  return `claimed_at.is.null,claimed_at.lt.${staleBefore}`
}

interface PublishJobRow {
  id: string
  workspace_id: string
  seed_id: string
  draft_id: string
  revision_id: string
  channel: PublishJob['channel']
  publish_mode: PublishMode
  status: PublishJob['status']
  scheduled_at?: string | null
  published_at?: string | null
  error_message?: string | null
  claimed_at?: string | null
  created_by: string
  created_at: string
}

function mapJob(row: PublishJobRow): PublishJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seedId: row.seed_id,
    draftId: row.draft_id,
    revisionId: row.revision_id,
    channel: row.channel,
    publishMode: row.publish_mode,
    status: row.status,
    scheduledAt: row.scheduled_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function queueReadError(scope: string, message: string): Error {
  return new Error(`${scope}を読み込めませんでした。空の公開予定として扱わず、再読み込みしてください: ${message}`)
}

export async function listWorkspacePublishJobs(workspaceId: string): Promise<PublishJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) throw queueReadError('公開予定', error.message)

  return (data ?? []).map((row) => mapJob(row as PublishJobRow))
}

export async function listSeedPublishJobs(
  workspaceId: string,
  seedId: string
): Promise<PublishJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('seed_id', seedId)
    .order('created_at', { ascending: false })

  if (error) throw queueReadError('このシードの公開予定', error.message)

  return (data ?? []).map((row) => mapJob(row as PublishJobRow))
}

export interface CreatePublishJobInput {
  workspaceId: string
  seedId: string
  draftId: string
  revisionId: string
  channel: PublishJob['channel']
  publishMode: PublishMode
  scheduledAt?: string
  createdBy: string
}

export async function createPublishJob(input: CreatePublishJobInput): Promise<PublishJob> {
  const supabase = createClient()

  // A manual channel has nothing for a Worker to do — it starts "draft"
  // until a human completes the zero-cost platform handoff. Everything else
  // starts "scheduled" for the opt-in API-first Worker path.
  const status = input.publishMode === 'manual' ? 'draft' : 'scheduled'
  const requestedScheduledAt = input.scheduledAt ?? null

  const { data, error } = await supabase
    .from('publish_jobs')
    .insert({
      workspace_id: input.workspaceId,
      seed_id: input.seedId,
      draft_id: input.draftId,
      revision_id: input.revisionId,
      channel: input.channel,
      publish_mode: input.publishMode,
      status,
      scheduled_at: requestedScheduledAt,
      created_by: input.createdBy,
    })
    .select()
    .single()

  if (!error) return mapJob(data as PublishJobRow)

  // The database insert guard serializes scheduling by immutable Revision. If
  // this was an HTTP retry after the first request committed (or the losing
  // half of an identical double click), return that durable row rather than
  // claiming scheduling failed. Only a row still in the exact initial state is
  // recoverable this way: a published/failed job is a terminal or materially
  // changed outcome and must never be reported to the caller as a fresh
  // successful schedule.
  const { data: existing, error: existingError } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('revision_id', input.revisionId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existingError && existing) {
    const row = existing as PublishJobRow
    const identicalRequest =
      row.status === status
      && row.seed_id === input.seedId
      && row.draft_id === input.draftId
      && row.channel === input.channel
      && row.publish_mode === input.publishMode
      && (row.scheduled_at ?? null) === requestedScheduledAt
      && row.created_by === input.createdBy

    if (identicalRequest) return mapJob(row)
  }

  throw new Error(error.message)
}

export async function retryPublishJob(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()

  const scheduledAt = new Date()
  scheduledAt.setMinutes(scheduledAt.getMinutes() + 5)

  const { data, error } = await supabase
    .from('publish_jobs')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
      error_message: null,
      claimed_at: null,
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'failed')
    .or(notActivelyClaimedFilter())
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    throw new Error('この公開予定は再試行できません（失敗状態ではないか、現在公開処理中です）。')
  }

  return mapJob(data as PublishJobRow)
}

export async function cancelPublishJob(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()

  // Only mutable, not-yet-terminal states may be cancelled. This protects a
  // published job from being rewritten to cancelled (which could otherwise
  // make the same Revision look eligible for a fresh schedule and re-publish).
  // Active claims remain protected; a stale/abandoned claim does not block.
  const { data, error } = await supabase
    .from('publish_jobs')
    .update({
      status: 'cancelled',
      claimed_at: null,
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .in('status', ['draft', 'scheduled', 'failed'])
    .or(notActivelyClaimedFilter())
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    throw new Error('この公開予定はキャンセルできません（すでに完了済み・キャンセル済み、または現在公開処理中です）。')
  }

  return mapJob(data as PublishJobRow)
}

/**
 * Records that a human actually published the content on the platform.
 *
 * In API-first mode, publish_mode='auto' remains protected: its success may
 * only come from a confirmed adapter call. In zero-cost mode the Worker and
 * trigger route are hard-disabled, so legacy auto jobs are intentionally
 * allowed through this reconciliation path after a human uses the handoff.
 *
 * Human success attempts now atomically mark the job published in the database
 * function used by recordPublishAttempt(). This method therefore treats an
 * already-published row as an idempotent success so the existing caller can
 * safely reconcile both pre- and post-migration flows.
 */
export async function markPublishJobManuallyCompleted(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()
  const allowLegacyAutoCompletion = getPublishingStrategy() === 'zero-cost'

  let query = supabase
    .from('publish_jobs')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .not('status', 'in', '(published,cancelled)')

  if (!allowLegacyAutoCompletion) {
    query = query.neq('publish_mode', 'auto')
  }

  const { data, error } = await query
    .or(notActivelyClaimedFilter())
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (data) return mapJob(data as PublishJobRow)

  const { data: existing, error: existingError } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing?.status === 'published') return mapJob(existing as PublishJobRow)

  throw new Error('This job cannot be marked as posted right now (already finished, protected auto-mode, or currently being published).')
}
