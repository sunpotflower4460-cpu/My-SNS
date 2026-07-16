import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublishAttempt, PublishAttemptStatus, PublishFailureReason } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface PublishAttemptRow {
  id: string
  workspace_id: string
  publish_job_id: string
  attempt_number: number
  status: PublishAttemptStatus
  failure_reason?: PublishFailureReason | null
  error_message?: string | null
  external_post_id?: string | null
  external_url?: string | null
  created_by?: string | null
  created_at: string
}

function mapAttempt(row: PublishAttemptRow): PublishAttempt {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    publishJobId: row.publish_job_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    failureReason: row.failure_reason ?? undefined,
    errorMessage: row.error_message ?? undefined,
    externalPostId: row.external_post_id ?? undefined,
    externalUrl: row.external_url ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  }
}

export async function listJobAttempts(workspaceId: string, jobId: string): Promise<PublishAttempt[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_attempts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('publish_job_id', jobId)
    .order('attempt_number', { ascending: false })

  if (error) {
    console.error('Error fetching publish attempts:', error)
    return []
  }

  return (data ?? []).map((row) => mapAttempt(row as PublishAttemptRow))
}

// Exported so the Analytics page can tell whether a stat might be
// understating a workspace's true history (loaded count === this cap) and
// label it accordingly, instead of silently presenting a truncated window
// as if it were the complete record.
export const WORKSPACE_PUBLISH_ATTEMPTS_LIMIT = 2000

/** For the Analytics page (PR7): success/failure rates and failure-reason breakdowns across the whole workspace. */
export async function listWorkspacePublishAttempts(workspaceId: string, limit = WORKSPACE_PUBLISH_ATTEMPTS_LIMIT): Promise<PublishAttempt[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_attempts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching workspace publish attempts:', error)
    return []
  }

  return (data ?? []).map((row) => mapAttempt(row as PublishAttemptRow))
}

export interface RecordPublishAttemptInput {
  workspaceId: string
  publishJobId: string
  status: PublishAttemptStatus
  failureReason?: PublishFailureReason
  errorMessage?: string
  externalPostId?: string
  externalUrl?: string
  createdBy?: string
}

/**
 * Records the next attempt for a job (auto-numbered) — used by both the
 * Worker (service-role client, automated attempts) and the app (browser
 * client, a human recording a manual completion). Attempts are never
 * updated after creation; a retry is always a new row.
 */
export async function recordPublishAttempt(
  supabase: SupabaseClient,
  input: RecordPublishAttemptInput,
): Promise<PublishAttempt> {
  const { count } = await supabase
    .from('publish_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('publish_job_id', input.publishJobId)

  const { data, error } = await supabase
    .from('publish_attempts')
    .insert({
      workspace_id: input.workspaceId,
      publish_job_id: input.publishJobId,
      attempt_number: (count ?? 0) + 1,
      status: input.status,
      failure_reason: input.failureReason ?? null,
      error_message: input.errorMessage ?? null,
      external_post_id: input.externalPostId ?? null,
      external_url: input.externalUrl ?? null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAttempt(data as PublishAttemptRow)
}
