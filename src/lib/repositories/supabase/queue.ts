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

export async function listWorkspacePublishJobs(workspaceId: string): Promise<PublishJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching publish jobs:', error)
    return []
  }

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

  if (error) {
    console.error('Error fetching Seed publish jobs:', error)
    return []
  }

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
      scheduled_at: input.scheduledAt ?? null,
      created_by: input.createdBy,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapJob(data as PublishJobRow)
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
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapJob(data as PublishJobRow)
}

export async function cancelPublishJob(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()

  // Refuses to cancel a job that's actively being published right now. A
  // stale/abandoned claim (see notActivelyClaimedFilter) doesn't block this.
  const { data, error } = await supabase
    .from('publish_jobs')
    .update({
      status: 'cancelled',
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .or(notActivelyClaimedFilter())
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!data) {
    throw new Error('This job is currently being published — try cancelling again in a moment.')
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
