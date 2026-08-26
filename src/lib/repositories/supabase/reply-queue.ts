import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReplyJob } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

// The messaging-side twin of queue.ts. A reply_job is created by the approve
// route (with a pre-computed absolute-UTC scheduled_at), listed by the inbox
// UI, sent by the reply Worker, and cancellable while it is still pending.

// A claim (see reply-worker.ts's claimReplyJob) older than this is treated as
// abandoned — same contract and threshold as the publish side.
const STALE_CLAIM_MINUTES = 10

function notActivelyClaimedFilter(): string {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  return `claimed_at.is.null,claimed_at.lt.${staleBefore}`
}

interface ReplyJobRow {
  id: string
  workspace_id: string
  inbox_item_id: string
  contact_id?: string | null
  suggestion_id?: string | null
  platform: ReplyJob['platform']
  reply_text: string
  send_target: string
  reply_mode: ReplyJob['replyMode']
  status: ReplyJob['status']
  scheduled_at: string
  sent_at?: string | null
  error_message?: string | null
  claimed_at?: string | null
  created_by: string
  created_at: string
}

export function mapReplyJob(row: ReplyJobRow): ReplyJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    inboxItemId: row.inbox_item_id,
    contactId: row.contact_id ?? undefined,
    suggestionId: row.suggestion_id ?? undefined,
    platform: row.platform,
    replyText: row.reply_text,
    sendTarget: row.send_target,
    replyMode: row.reply_mode,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function replyQueueReadError(message: string): Error {
  return new Error(`返信予定を読み込めませんでした。空の予定として扱わず、再読み込みしてください: ${message}`)
}

export async function listWorkspaceReplyJobs(workspaceId: string): Promise<ReplyJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('reply_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) throw replyQueueReadError(error.message)

  return (data ?? []).map((row) => mapReplyJob(row as ReplyJobRow))
}

/**
 * Used after an INSERT is rejected by the database duplicate guard. Returning
 * the durable existing row lets an HTTP retry of the same approval be
 * idempotent instead of reporting a false failure or creating a second send.
 */
export async function findNonCancelledReplyJob(
  supabase: SupabaseClient,
  workspaceId: string,
  inboxItemId: string,
): Promise<ReplyJob | null> {
  const { data, error } = await supabase
    .from('reply_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('inbox_item_id', inboxItemId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapReplyJob(data as ReplyJobRow) : null
}

export interface CreateReplyJobInput {
  workspaceId: string
  inboxItemId: string
  contactId?: string
  suggestionId?: string
  platform: ReplyJob['platform']
  replyText: string
  sendTarget: string
  replyMode: ReplyJob['replyMode']
  scheduledAt: string
  createdBy: string
}

/**
 * Enqueues an approved reply. The database insert guard serializes creations
 * per inbox item and rejects a second non-cancelled job across manual/auto
 * paths. Uses the caller's client; normal RLS still authorizes the INSERT.
 */
export async function createReplyJob(supabase: SupabaseClient, input: CreateReplyJobInput): Promise<ReplyJob> {
  const { data, error } = await supabase
    .from('reply_jobs')
    .insert({
      workspace_id: input.workspaceId,
      inbox_item_id: input.inboxItemId,
      contact_id: input.contactId ?? null,
      suggestion_id: input.suggestionId ?? null,
      platform: input.platform,
      reply_text: input.replyText,
      send_target: input.sendTarget,
      reply_mode: input.replyMode,
      status: 'scheduled',
      scheduled_at: input.scheduledAt,
      created_by: input.createdBy,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapReplyJob(data as ReplyJobRow)
}

/**
 * Cancels a still-pending reply. Refuses while the job is actively being sent
 * (a real LINE push could be in flight) — a stale/abandoned claim doesn't
 * block this, exactly like cancelPublishJob. A stale claim is cleared when the
 * cancellation succeeds so terminal rows do not keep misleading claim state.
 */
export async function cancelReplyJob(workspaceId: string, jobId: string): Promise<ReplyJob> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('reply_jobs')
    .update({ status: 'cancelled', claimed_at: null, claim_token: null })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'scheduled')
    .or(notActivelyClaimedFilter())
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    throw new Error('この返信は取り消せません（すでに送信済み・取り消し済み、または送信処理中です）。')
  }

  return mapReplyJob(data as ReplyJobRow)
}
