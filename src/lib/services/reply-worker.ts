import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceRole } from '@/lib/domain/types'
import { recordReplyAttempt } from '@/lib/repositories/supabase/reply-attempts'
import { createNotifications } from '@/lib/repositories/supabase/notifications'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { classifyFailure, resolveCredentials } from '@/lib/services/publish-worker'
import { hasPermission } from '@/lib/permissions'
import { resolveArtistOsMode } from '@/lib/service/artist-os-mode'
import { ledgerClientFromEnv, type ActionKeyParts } from '@/lib/service/action-ledger-client'
import { runWithInboundReplyLedger } from '@/lib/service/managed-reply-guard'

// The messaging-side twin of publish-worker.ts. Shared with the publish side:
// resolveCredentials (decrypts the connected account's token, refreshes if
// needed) and classifyFailure (buckets an adapter error). Everything else is a
// reply-jobs mirror of the publish-jobs Worker: claim atomically, send via the
// LINE connector, record an append-only attempt, release the job, audit, and
// notify on failure. Never throws — a failure is always recorded, not lost.

const STALE_CLAIM_MINUTES = 10
// LINE keeps X-Line-Retry-Key idempotency state for 24 hours. Never automatically
// reclaim a send claim older than this safety window: after LINE forgets the key,
// replaying the job could become a genuinely new push. A human can inspect and
// close/cancel such a stranded job rather than risk a duplicate recipient DM.
const LINE_RETRY_KEY_SAFE_RECLAIM_HOURS = 23

function reclaimableClaimFilter(): string {
  const now = Date.now()
  const staleBefore = new Date(now - STALE_CLAIM_MINUTES * 60_000).toISOString()
  const retryKeyStillSafeAfter = new Date(now - LINE_RETRY_KEY_SAFE_RECLAIM_HOURS * 60 * 60_000).toISOString()
  return `claimed_at.is.null,and(claimed_at.lt.${staleBefore},claimed_at.gt.${retryKeyStillSafeAfter})`
}

/**
 * Atomically marks a reply job as being sent right now. The token is the
 * ownership proof; claimed_at is only the stale/liveness clock. A request that
 * returns after a newer Worker reclaimed a stale job therefore cannot clear or
 * overwrite the newer claim. Claims older than the provider retry-key window
 * are deliberately not reclaimed automatically.
 */
async function claimReplyJob(supabase: SupabaseClient, jobId: string): Promise<string | null> {
  const claimToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('reply_jobs')
    .update({ claimed_at: new Date().toISOString(), claim_token: claimToken })
    .eq('id', jobId)
    .in('status', ['scheduled', 'failed'])
    .or(reclaimableClaimFilter())
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? claimToken : null
}

async function releaseReplyJobClaim(
  supabase: SupabaseClient,
  jobId: string,
  claimToken: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('reply_jobs')
    .update({ ...fields, claimed_at: null, claim_token: null })
    .eq('id', jobId)
    .eq('claim_token', claimToken)
    // Guard against a human cancelling, a stale reclaim by a newer Worker, or
    // an already-reconciled sent row.
    .in('status', ['scheduled', 'failed'])
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function hasSuccessfulReplyAttempt(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('reply_attempts')
    .select('id')
    .eq('reply_job_id', jobId)
    .eq('status', 'success')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

/**
 * Notifies whoever should hear about a failed reply send: the job's creator
 * plus anyone who can act on the inbox (reply_inbox), deduplicated. Called from
 * inside the failure path's own try/catch — a notification error must never
 * turn into a second failed attempt.
 */
async function notifyReplyFailure(supabase: SupabaseClient, job: ReplyableJob, errorMessage: string): Promise<void> {
  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', job.workspaceId)

  const recipientIds = new Set<string>([job.createdBy])
  for (const row of (memberRows ?? []) as Array<{ user_id: string; role: WorkspaceRole }>) {
    if (hasPermission(row.role, 'reply_inbox')) recipientIds.add(row.user_id)
  }

  await createNotifications(
    supabase,
    Array.from(recipientIds).map((userId) => ({
      workspaceId: job.workspaceId,
      userId,
      type: 'reply_failed',
      title: '返信の送信に失敗しました',
      body: errorMessage.slice(0, 300),
      targetType: 'inbox_item',
      targetId: job.inboxItemId,
    })),
  )
}

const NATIVE_ID_PREFIXES = ['ig-comment-', 'ig-dm-', 'sa-ig-comment-', 'sa-ig-dm-']

/**
 * The CrossSystemActionKey parts for the inbound event this job answers: platform + operation + the
 * platform-native event id (inbox_items.external_id). Never derived from the reply text.
 * Returns null when it cannot be built; managed mode then refuses to send.
 */
async function loadInboundActionParts(supabase: SupabaseClient, job: ReplyableJob): Promise<ActionKeyParts | null> {
  const { data, error } = await supabase
    .from('inbox_items')
    .select('platform, kind, external_id')
    .eq('id', job.inboxItemId)
    .eq('workspace_id', job.workspaceId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { platform: string; kind: string; external_id: string | null }
  if (!row.external_id) return null
  const operation = row.kind === 'dm' ? 'dm_reply' : row.kind === 'mention' ? 'mention_reply' : 'comment_reply'
  let id = row.external_id.trim()
  for (const p of NATIVE_ID_PREFIXES) if (id.startsWith(p)) id = id.slice(p.length)
  return { platform: row.platform, operation, externalEventId: id }
}

/**
 * `true` ONLY when the provider's own answer proves the reply was NOT accepted: an explicit HTTP 4xx from the
 * send call (excluding 408/409/425, which can mean "accepted, retry to reconcile"). classifyFailure() is
 * deliberately NOT used: it falls back to 'validation' for any unrecognised text, and an unrecognised error
 * must be treated as an UNCERTAIN outcome (the ledger then blocks every sender until a human reconciles).
 */
function isDefinitiveReplyFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const m = /^LINE push failed \((\d{3})\)/.exec(message)
  if (!m) return false
  const status = Number(m[1])
  return status >= 400 && status < 500 && ![408, 409, 425].includes(status)
}

export interface ReplyableJob {
  id: string
  workspaceId: string
  platform: 'line' // Phase 1 only LINE actually sends; IG DM is deferred at the approve gate.
  inboxItemId: string
  sendTarget: string
  replyText: string
  createdBy: string
}

export interface ProcessReplyResult {
  success: boolean
  /** True when this call didn't attempt anything because another still-active claim already exists. */
  skipped?: boolean
}

type ConfirmedReplyResult = {
  externalMessageId?: string
}

/**
 * Sends one reply job end to end: claim it, resolve the LINE credentials, push
 * the message, record the attempt, update the job, audit, and (on failure)
 * notify. Never throws — the batch Worker relies on that to keep processing the
 * rest of the due jobs in the same run.
 */
export async function processReplyJob(supabase: SupabaseClient, job: ReplyableJob): Promise<ProcessReplyResult> {
  const claimToken = await claimReplyJob(supabase, job.id)
  if (!claimToken) {
    // Someone else (another "Send now", or an overlapping Worker tick) is
    // already actively sending this — or this is an old ambiguous claim outside
    // LINE's 24h retry-key window. In either case never blindly issue a new push.
    return { success: false, skipped: true }
  }

  let confirmedReply: ConfirmedReplyResult | null = null

  try {
    // If LINE already confirmed this message in an earlier run but updating the
    // reply_jobs row failed afterwards, reconcile from the durable success
    // attempt and never send the same message again.
    if (await hasSuccessfulReplyAttempt(supabase, job.id)) {
      await releaseReplyJobClaim(supabase, job.id, claimToken, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      return { success: true }
    }

    const credentials = await resolveCredentials(supabase, job.workspaceId, job.platform)
    if (!credentials) {
      throw new Error(`接続済みのLINEアカウントがありません。設定から接続してください。`)
    }

    const adapter = getConnectorAdapter(job.platform)
    const send = () =>
      adapter.sendMessage({
        platform: job.platform,
        accessToken: credentials.accessToken,
        target: job.sendTarget,
        text: job.replyText,
        externalAccountId: credentials.externalAccountId,
        // Stable across every attempt for this immutable reply job. LINE receives
        // this on the first push and on every safe retry, so a lost DB response
        // cannot turn into a duplicate recipient message.
        retryKey: job.id,
      })

    // Artist OS managed mode: the external write is coordinated through the Action Ledger and fails
    // closed (no ledger / no reservation / unknown outcome ⇒ no send). Standalone: exactly the old call.
    const { mode } = resolveArtistOsMode()
    const outcome = await runWithInboundReplyLedger({
      mode,
      ledger: mode === 'standalone' ? null : ledgerClientFromEnv(),
      parts: mode === 'standalone' ? null : await loadInboundActionParts(supabase, job),
      send,
      isDefinitiveFailure: isDefinitiveReplyFailure,
    })
    if (outcome.kind === 'blocked') {
      // Not sent, by design. Recorded as a failed attempt (visible to humans); OUTCOME_UNKNOWN / ALREADY_* stay blocked on every retry.
      throw new Error(`MANAGED_MODE_BLOCKED: reply not sent (${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ''}).`)
    }
    if (outcome.kind === 'failed') throw outcome.error
    const result = outcome.value
    confirmedReply = result

    await recordReplyAttempt(supabase, {
      workspaceId: job.workspaceId,
      replyJobId: job.id,
      status: 'success',
      externalMessageId: result.externalMessageId,
    })

    await releaseReplyJobClaim(supabase, job.id, claimToken, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      error_message: null,
    })

    await supabase.from('audit_logs').insert({
      workspace_id: job.workspaceId,
      actor_id: job.createdBy,
      action: 'inbox_reply_sent',
      target_type: 'inbox_item',
      target_id: job.inboxItemId,
      metadata: { platform: job.platform, externalMessageId: result.externalMessageId },
    })

    return { success: true }
  } catch (cause) {
    // A confirmed LINE push (including a 409 retry-key reconciliation) must
    // never be rewritten as failed merely because later DB bookkeeping failed.
    if (confirmedReply) {
      try {
        if (!(await hasSuccessfulReplyAttempt(supabase, job.id))) {
          await recordReplyAttempt(supabase, {
            workspaceId: job.workspaceId,
            replyJobId: job.id,
            status: 'success',
            externalMessageId: confirmedReply.externalMessageId,
          })
        }
        await releaseReplyJobClaim(supabase, job.id, claimToken, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        return { success: true }
      } catch (reconciliationError) {
        console.error(`Confirmed reply for job ${job.id} could not be reconciled:`, reconciliationError)
        // Leave a durable unsafe marker so cancel cannot open a new send with a
        // fresh job UUID / LINE retry key while this push may already exist.
        const unknownMessage =
          'EXTERNAL_RESULT_UNKNOWN: LINE may already have accepted this reply, but local bookkeeping failed. Inspect LINE before sending again.'
        try {
          await releaseReplyJobClaim(supabase, job.id, claimToken, {
            status: 'failed',
            error_message: unknownMessage,
          })
        } catch (markerError) {
          console.error(`Failed to persist EXTERNAL_RESULT_UNKNOWN for reply job ${job.id}:`, markerError)
        }
        return { success: false }
      }
    }

    const message = cause instanceof Error ? cause.message : '返信の送信に失敗しました。'
    // Our own "接続済みのLINEアカウントがありません" wording is a connection
    // problem → classify as auth, not the generic validation fallback.
    const failureReason = message.startsWith('接続済みのLINEアカウントがありません') ? 'auth' : classifyFailure(message)

    try {
      await recordReplyAttempt(supabase, {
        workspaceId: job.workspaceId,
        replyJobId: job.id,
        status: 'failed',
        failureReason,
        errorMessage: message,
      })

      await releaseReplyJobClaim(supabase, job.id, claimToken, { status: 'failed', error_message: message })

      await supabase.from('audit_logs').insert({
        workspace_id: job.workspaceId,
        actor_id: job.createdBy,
        action: 'inbox_reply_failed',
        target_type: 'inbox_item',
        target_id: job.inboxItemId,
        metadata: { platform: job.platform, failureReason, errorMessage: message },
      })

      await notifyReplyFailure(supabase, job, message)
    } catch (unexpected) {
      // Safety net: a DB hiccup recording *why* this send failed must never
      // throw out of this function. The claim may be left set; it is only
      // automatically reclaimable while LINE still remembers this job's retry
      // key, preventing a very old ambiguous send from being replayed as new.
      console.error(`Unexpected error finishing reply_job ${job.id}:`, unexpected)
    }

    return { success: false }
  }
}
