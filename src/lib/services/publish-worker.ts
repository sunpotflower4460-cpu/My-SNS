import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssetType, PublishFailureReason, SocialPlatform, WorkspaceRole } from '@/lib/domain/types'
import { recordPublishAttempt } from '@/lib/repositories/supabase/publish-attempts'
import { getSocialCredentials, saveSocialCredentials } from '@/lib/repositories/supabase/social-credentials'
import { createNotifications } from '@/lib/repositories/supabase/notifications'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { hasPermission } from '@/lib/permissions'

// Shared by the scheduled Worker (/api/publish/run, batches every due
// publish_mode='auto' job) and the manual trigger route (/api/publish/trigger,
// one job at a time for assisted/draft-mode channels like YouTube/TikTok that
// intentionally aren't picked up automatically — see PublishMode's doc comment).

// A claim older than this is treated as abandoned (e.g. a serverless
// function was killed mid-publish before it could clear its own claim) and
// can be reclaimed — see queue.ts's matching STALE_CLAIM_MINUTES for the
// same threshold applied to cancel/manual-complete.
const STALE_CLAIM_MINUTES = 10

function staleClaimFilter(): string {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  return `claimed_at.is.null,claimed_at.lt.${staleBefore}`
}

/**
 * Atomically marks a job as "being worked on right now". Returns false if
 * another still-active claim already exists — the caller must not attempt
 * to publish in that case (a real platform call could already be in
 * flight for it). This is what makes "Publish now" safe to click twice, and
 * what stops a cancel from racing an in-flight publish undetected.
 */
async function claimPublishJob(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('publish_jobs')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['scheduled', 'draft', 'failed'])
    .or(staleClaimFilter())
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function releasePublishJobClaim(supabase: SupabaseClient, jobId: string, fields: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await supabase
    .from('publish_jobs')
    .update({ ...fields, claimed_at: null })
    .eq('id', jobId)
    // Never overwrite a cancellation or an already-reconciled published row.
    .in('status', ['scheduled', 'draft', 'failed'])
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function hasSuccessfulPublishAttempt(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('publish_attempts')
    .select('id')
    .eq('publish_job_id', jobId)
    .eq('status', 'success')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

/**
 * Notifies whoever should hear about a failed publish attempt: the job's
 * creator (they scheduled it) plus anyone who can act on the Queue
 * (manage_queue — owner/admin), deduplicated. Failure to notify must never
 * fail the job itself — this is called from inside the failure path's own
 * try/catch, so a notification error surfaces as a logged "unexpected"
 * error, not a second failed publish_attempt.
 */
async function notifyPublishFailure(supabase: SupabaseClient, job: PublishableJob, errorMessage: string): Promise<void> {
  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', job.workspaceId)

  const recipientIds = new Set<string>([job.createdBy])
  for (const row of (memberRows ?? []) as Array<{ user_id: string; role: WorkspaceRole }>) {
    if (hasPermission(row.role, 'manage_queue')) recipientIds.add(row.user_id)
  }

  await createNotifications(
    supabase,
    Array.from(recipientIds).map((userId) => ({
      workspaceId: job.workspaceId,
      userId,
      type: 'publish_failed',
      title: `${job.channel} publish failed`,
      body: errorMessage.slice(0, 300),
      targetType: 'publish_job',
      targetId: job.id,
    })),
  )
}

// The stub connector's exact wording (see UnavailableSocialConnectorAdapter).
// Checked as a specific phrase, not a bare "unavailable" substring — a real
// future adapter's transient "503 Service Unavailable" should classify as
// network (retryable), not this "connector isn't configured yet" bucket.
const CONNECTOR_NOT_READY_PHRASE = 'unavailable until the reviewed platform connector phase'

/** Turns an adapter error message into one of the documented failure buckets. */
export function classifyFailure(message: string): PublishFailureReason {
  const lower = message.toLowerCase()
  if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized') || lower.includes('reconnect')) return 'auth'
  if (lower.includes('rate limit') || lower.includes('429')) return 'ratelimit'
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch failed')) return 'network'
  if (lower.includes(CONNECTOR_NOT_READY_PHRASE)) return 'unavailable'
  return 'validation'
}

export interface ResolvedCredentials {
  accessToken: string
  handle?: string
  externalAccountId?: string
}

/** Not connected, or the connector can't publish yet (throws) → the caller classifies that as an "auth" failure. */
export async function resolveCredentials(
  supabase: SupabaseClient,
  workspaceId: string,
  channel: SocialPlatform,
): Promise<ResolvedCredentials | null> {
  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, handle, external_account_id')
    .eq('workspace_id', workspaceId)
    .eq('platform', channel)
    .eq('connected', true)
    .maybeSingle()

  if (!account) return null

  const stored = await getSocialCredentials(supabase, account.id)
  if (!stored) return null

  const isExpired = stored.expiresAt ? new Date(stored.expiresAt).getTime() <= Date.now() : false
  if (!isExpired) {
    return { accessToken: stored.accessToken, handle: account.handle, externalAccountId: account.external_account_id ?? undefined }
  }

  if (!stored.refreshToken) {
    throw new Error(`${channel} access token expired and there is no refresh token. Reconnect the account.`)
  }

  const refreshed = await getConnectorAdapter(channel).refreshAccessToken(channel, stored.refreshToken)

  try {
    // Persisted immediately, before this token is used for anything else:
    // some providers (X) rotate refresh tokens, so the one just used is
    // already invalid at the provider. If this save fails, the old token in
    // the DB is now dead too — there is no way to make this atomic with an
    // external API call, so the best we can do is fail loudly and specifically
    // rather than silently keep using a refresh token that no longer works.
    await saveSocialCredentials(supabase, account.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes,
    })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'unknown error'
    throw new Error(
      `${channel} token was refreshed but could not be saved (${detail}). Reconnect the account — the old refresh token may no longer be valid.`,
    )
  }

  return { accessToken: refreshed.accessToken, handle: account.handle, externalAccountId: account.external_account_id ?? undefined }
}

export interface PublishableJob {
  id: string
  workspaceId: string
  channel: SocialPlatform
  createdBy: string
  /** Seed that originated this job. Used to resolve media assets at publish time. */
  seedId?: string
  revision: {
    title: string | null
    body: string
    hashtags: string[]
    cta: string | null
    metadata: Record<string, unknown>
  }
}

export interface ProcessJobResult {
  success: boolean
  /** True when this call didn't attempt anything because another still-active claim already exists. */
  skipped?: boolean
}

type ConfirmedPublishResult = {
  externalPostId?: string
  externalUrl?: string
}

interface AssetRow {
  id: string
  storage_path: string | null
  type: AssetType
  publishing_channels: SocialPlatform[] | null
}

/**
 * Resolves a signed media URL from the Seed's uploaded assets for the given
 * channel. Returns null when there are no relevant assets or the Seed is not
 * known (e.g. note / text-only channels where mediaUrl is never needed).
 *
 * A fresh signed URL is generated every time so the URL passed to the adapter
 * is always valid for at least one hour regardless of when the job was
 * originally scheduled.
 */
async function resolvePublishMediaMetadata(
  supabase: SupabaseClient,
  seedId: string,
  channel: SocialPlatform,
): Promise<{ mediaUrl: string; mediaType: 'image' | 'video' } | null> {
  const { data: rows, error } = await supabase
    .from('assets')
    .select('id, storage_path, type, publishing_channels')
    .eq('seed_id', seedId)
    .in('type', ['image', 'video'])

  if (error || !rows || rows.length === 0) return null

  // Respect per-asset channel assignments (empty/null means all channels).
  const candidates = (rows as AssetRow[]).filter((row) => {
    const channels = row.publishing_channels
    return !channels || channels.length === 0 || channels.includes(channel)
  })

  // Prefer video over image so the richer format is used when both exist.
  const chosen = candidates.find((row) => row.type === 'video') ?? candidates.find((row) => row.type === 'image')
  if (!chosen?.storage_path) return null

  const { data: signedData, error: signError } = await supabase.storage
    .from('assets')
    .createSignedUrl(chosen.storage_path, 60 * 60)

  if (signError || !signedData?.signedUrl) return null

  return {
    mediaUrl: signedData.signedUrl,
    mediaType: chosen.type === 'video' ? 'video' : 'image',
  }
}

/**
 * Attempts one job end to end: claim it, resolve credentials, call the
 * adapter, record the attempt, update the job, write an audit log. Never
 * throws — callers (the batch Worker, the single-job manual trigger) don't
 * need their own try/catch around this; a failure here is always recorded,
 * not lost.
 */
export async function processPublishJob(supabase: SupabaseClient, job: PublishableJob): Promise<ProcessJobResult> {
  const claimed = await claimPublishJob(supabase, job.id)
  if (!claimed) {
    // Someone else (another admin's "Publish now", or an overlapping Worker
    // tick) is already actively working this job — never attempt a second,
    // possibly duplicate, real platform call.
    return { success: false, skipped: true }
  }

  let confirmedPublish: ConfirmedPublishResult | null = null

  try {
    // A previous run can have completed the real platform call and persisted
    // its success attempt, then failed while updating publish_jobs. Reconcile
    // that durable success before ever calling the external platform again.
    if (await hasSuccessfulPublishAttempt(supabase, job.id)) {
      await releasePublishJobClaim(supabase, job.id, {
        status: 'published',
        published_at: new Date().toISOString(),
        error_message: null,
      })
      return { success: true }
    }

    const credentials = await resolveCredentials(supabase, job.workspaceId, job.channel)
    if (!credentials) {
      throw new Error(`No connected ${job.channel} account for this workspace. Connect one from Settings.`)
    }

    // Resolve a fresh signed URL from the Seed's uploaded assets so the
    // adapter always receives a valid, non-expired mediaUrl at publish time
    // (signed URLs are only 1 hour, too short to store in the revision).
    // If mediaUrl is already present in the revision metadata (e.g. set
    // manually), it takes precedence over the automatic resolution.
    let resolvedMetadata: Record<string, unknown> = { ...job.revision.metadata }
    if (job.seedId && !resolvedMetadata.mediaUrl) {
      const media = await resolvePublishMediaMetadata(supabase, job.seedId, job.channel).catch((cause) => {
        // Media resolution is best-effort: a missing signed URL means the
        // adapter will throw its own "requires a media URL" error, which is
        // clearer to the user and already classified as a validation failure.
        console.warn(`Media resolution for job ${job.id} failed:`, cause)
        return null
      })
      if (media) {
        resolvedMetadata = { ...resolvedMetadata, mediaUrl: media.mediaUrl, mediaType: media.mediaType }
      }
    }

    const adapter = getConnectorAdapter(job.channel)
    const result = await adapter.publish({
      platform: job.channel,
      accessToken: credentials.accessToken,
      handle: credentials.handle,
      externalAccountId: credentials.externalAccountId,
      title: job.revision.title ?? undefined,
      body: job.revision.body,
      hashtags: job.revision.hashtags,
      cta: job.revision.cta ?? undefined,
      metadata: resolvedMetadata,
    })
    confirmedPublish = result

    await recordPublishAttempt(supabase, {
      workspaceId: job.workspaceId,
      publishJobId: job.id,
      status: 'success',
      externalPostId: result.externalPostId,
      externalUrl: result.externalUrl,
    })

    // If a human cancelled after the real publish began, this deliberately
    // leaves the cancellation intact. The success attempt still records what
    // happened externally, and future workers will not call the platform again.
    await releasePublishJobClaim(supabase, job.id, { status: 'published', published_at: new Date().toISOString(), error_message: null })

    await supabase.from('audit_logs').insert({
      workspace_id: job.workspaceId,
      actor_id: job.createdBy,
      action: 'queue_item_published',
      target_type: 'publish_job',
      target_id: job.id,
      metadata: { channel: job.channel, externalUrl: result.externalUrl },
    })

    return { success: true }
  } catch (cause) {
    // Once the external platform has confirmed success, never classify a later
    // database bookkeeping problem as a failed publish. Reconcile the durable
    // success attempt/job state instead; most importantly, never trigger a
    // second platform call on the next Worker run.
    if (confirmedPublish) {
      try {
        if (!(await hasSuccessfulPublishAttempt(supabase, job.id))) {
          await recordPublishAttempt(supabase, {
            workspaceId: job.workspaceId,
            publishJobId: job.id,
            status: 'success',
            externalPostId: confirmedPublish.externalPostId,
            externalUrl: confirmedPublish.externalUrl,
          })
        }
        await releasePublishJobClaim(supabase, job.id, {
          status: 'published',
          published_at: new Date().toISOString(),
          error_message: null,
        })
        return { success: true }
      } catch (reconciliationError) {
        console.error(`Confirmed publish for job ${job.id} could not be reconciled:`, reconciliationError)
        return { success: false }
      }
    }

    const message = cause instanceof Error ? cause.message : 'Publishing failed.'
    // "No connected ... account" is our own resolveCredentials wording, not
    // an adapter error — checked precisely here rather than folded into the
    // generic heuristic below, which is tuned for wording we don't control.
    const failureReason = message.startsWith('No connected') ? 'auth' : classifyFailure(message)

    try {
      await recordPublishAttempt(supabase, {
        workspaceId: job.workspaceId,
        publishJobId: job.id,
        status: 'failed',
        failureReason,
        errorMessage: message,
      })

      await releasePublishJobClaim(supabase, job.id, { status: 'failed', error_message: message })

      await supabase.from('audit_logs').insert({
        workspace_id: job.workspaceId,
        actor_id: job.createdBy,
        action: 'queue_item_failed',
        target_type: 'publish_job',
        target_id: job.id,
        metadata: { channel: job.channel, failureReason, errorMessage: message },
      })

      await notifyPublishFailure(supabase, job, message)
    } catch (unexpected) {
      // Safety net: a DB hiccup recording *why* this job failed must never
      // throw out of this function — the batch Worker relies on that to keep
      // processing the rest of the due jobs in the same run. The claim may
      // be left set here; it will still be treated as abandoned and
      // reclaimable after STALE_CLAIM_MINUTES.
      console.error(`Unexpected error finishing publish_job ${job.id}:`, unexpected)
    }

    return { success: false }
  }
}
