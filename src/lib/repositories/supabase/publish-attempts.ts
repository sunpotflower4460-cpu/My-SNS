import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublishAttempt, PublishAttemptStatus, PublishFailureReason } from '@/lib/domain/types'
import { getPublishingStrategy } from '@/lib/channels/config'
import { normalizeExternalHttpUrl } from '@/lib/security/external-url'
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
    externalUrl: normalizeExternalHttpUrl(row.external_url),
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
    throw new Error(`投稿試行履歴を読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
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
    throw new Error(`投稿試行履歴を読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
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

const ATTEMPT_NUMBER_RETRIES = 3

async function nextAttemptNumber(supabase: SupabaseClient, publishJobId: string): Promise<number> {
  const { data, error } = await supabase
    .from('publish_attempts')
    .select('attempt_number')
    .eq('publish_job_id', publishJobId)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return ((data as { attempt_number?: number } | null)?.attempt_number ?? 0) + 1
}

/**
 * Records the next attempt for a job. A human-confirmed success goes through
 * complete_manual_publish(), which records the attempt and marks the job
 * published in one transaction. Worker/failure attempts keep the generic
 * append-only path with a narrow unique-conflict retry.
 */
export async function recordPublishAttempt(
  supabase: SupabaseClient,
  input: RecordPublishAttemptInput,
): Promise<PublishAttempt> {
  const externalUrl = normalizeExternalHttpUrl(input.externalUrl)

  if (input.status === 'success' && input.createdBy) {
    const { data, error } = await supabase.rpc('complete_manual_publish', {
      p_workspace_id: input.workspaceId,
      p_job_id: input.publishJobId,
      p_external_url: externalUrl ?? null,
      p_external_post_id: input.externalPostId ?? null,
      p_allow_auto: getPublishingStrategy() === 'zero-cost',
    })

    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('手動公開の完了記録を保存できませんでした。')
    return mapAttempt(row as unknown as PublishAttemptRow)
  }

  for (let retry = 0; retry < ATTEMPT_NUMBER_RETRIES; retry += 1) {
    const attemptNumber = await nextAttemptNumber(supabase, input.publishJobId)
    const { data, error } = await supabase
      .from('publish_attempts')
      .insert({
        workspace_id: input.workspaceId,
        publish_job_id: input.publishJobId,
        attempt_number: attemptNumber,
        status: input.status,
        failure_reason: input.failureReason ?? null,
        error_message: input.errorMessage ?? null,
        external_post_id: input.externalPostId ?? null,
        external_url: externalUrl ?? null,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single()

    if (!error) return mapAttempt(data as PublishAttemptRow)

    const attemptNumberConflict = error.code === '23505'
    if (!attemptNumberConflict || retry === ATTEMPT_NUMBER_RETRIES - 1) {
      throw new Error(error.message)
    }
  }

  throw new Error('Unable to record publish attempt.')
}
