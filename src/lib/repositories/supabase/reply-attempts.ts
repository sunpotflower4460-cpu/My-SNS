import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublishAttemptStatus, PublishFailureReason, ReplyAttempt } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

// The messaging-side twin of publish-attempts.ts — an append-only send-attempt
// history for reply_jobs. A re-send is always a new row; attempts are never
// updated after creation.

interface ReplyAttemptRow {
  id: string
  workspace_id: string
  reply_job_id: string
  attempt_number: number
  status: PublishAttemptStatus
  failure_reason?: PublishFailureReason | null
  error_message?: string | null
  external_message_id?: string | null
  created_by?: string | null
  created_at: string
}

function mapAttempt(row: ReplyAttemptRow): ReplyAttempt {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    replyJobId: row.reply_job_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    failureReason: row.failure_reason ?? undefined,
    errorMessage: row.error_message ?? undefined,
    externalMessageId: row.external_message_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  }
}

export async function listReplyJobAttempts(workspaceId: string, replyJobId: string): Promise<ReplyAttempt[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('reply_attempts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('reply_job_id', replyJobId)
    .order('attempt_number', { ascending: false })

  if (error) {
    console.error('Error fetching reply attempts:', error)
    return []
  }

  return (data ?? []).map((row) => mapAttempt(row as ReplyAttemptRow))
}

export interface RecordReplyAttemptInput {
  workspaceId: string
  replyJobId: string
  status: PublishAttemptStatus
  failureReason?: PublishFailureReason
  errorMessage?: string
  externalMessageId?: string
  createdBy?: string
}

/**
 * Records the next send attempt for a reply job (auto-numbered). Only ever
 * called by the reply Worker (service-role client) — there is no manual-send
 * path for a DM, so unlike publish attempts there is no browser-client writer.
 */
export async function recordReplyAttempt(
  supabase: SupabaseClient,
  input: RecordReplyAttemptInput,
): Promise<ReplyAttempt> {
  const { count } = await supabase
    .from('reply_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('reply_job_id', input.replyJobId)

  const { data, error } = await supabase
    .from('reply_attempts')
    .insert({
      workspace_id: input.workspaceId,
      reply_job_id: input.replyJobId,
      attempt_number: (count ?? 0) + 1,
      status: input.status,
      failure_reason: input.failureReason ?? null,
      error_message: input.errorMessage ?? null,
      external_message_id: input.externalMessageId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAttempt(data as ReplyAttemptRow)
}
