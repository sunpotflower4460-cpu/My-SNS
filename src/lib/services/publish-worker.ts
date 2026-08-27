import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssetType, PublishFailureReason, SocialPlatform, WorkspaceRole } from '@/lib/domain/types'
import { recordPublishAttempt } from '@/lib/repositories/supabase/publish-attempts'
import {
  getSocialCredentials,
  saveSocialCredentials,
  type StoredCredentials,
} from '@/lib/repositories/supabase/social-credentials'
import { createNotifications } from '@/lib/repositories/supabase/notifications'
import { getConnectorAdapter } from '@/lib/services/connectors'
import {
  claimSocialCredentialRefresh,
  releaseSocialCredentialRefresh,
} from '@/lib/services/social-credential-refresh-claim'
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

// Do not hand a token to an external API when it is about to expire mid-call.
// Refresh one minute early so upload/status/network latency does not turn a
// technically-valid-at-read-time token into an avoidable 401 during the call.
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000
const REFRESH_WAIT_ATTEMPTS = 30
const REFRESH_WAIT_INTERVAL_MS = 250

// Signed URLs from Supabase Storage are valid for 1 hour (3600 s). This is
// intentionally short: the URL is generated immediately before the publish
// call so it is always fresh, regardless of when the job was scheduled.
const SIGNED_URL_TTL_SECONDS = 60 * 60

function staleClaimFilter(): string {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  return `claimed_at.is.null,claimed_at.lt.${staleBefore}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function credentialsNeedRefresh(credentials: StoredCredentials): boolean {
  if (!credentials.expiresAt) return false
  const expiresAt = new Date(credentials.expiresAt).getTime()
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS
}

function resolvedCredentialShape(
  credentials: StoredCredentials,
  account: { handle: string | null; external_account_id: string | null },
): ResolvedCredentials {
  return {
    accessToken: credentials.accessToken,
    handle: account.handle ?? undefined,
    externalAccountId: account.external_account_id ?? undefined,
  }
}

async function waitForConcurrentCredentialRefresh(
  supabase: SupabaseClient,
  socialAccountId: string,
): Promise<StoredCredentials | null> {
  for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
    await sleep(REFRESH_WAIT_INTERVAL_MS)
    const latest = await getSocialCredentials(supabase, socialAccountId)
    // Credential removal can mean the account was superseded/disconnected while
    // we waited. The caller will re-resolve the currently connected row.
    if (!latest) return null
    if (!credentialsNeedRefresh(latest)) return latest
  }
  return null
}

/**
 * Atomically marks a job as "being worked on right now". The random token is
 * ownership, while claimed_at is only liveness/staleness. Returning the token
 * lets every later state change prove this same request still owns the claim;
 * an older request that comes back after a stale reclaim cannot clear or
 * overwrite the newer worker's claim (ABA race).
 */
async function claimPublishJob(supabase: SupabaseClient, jobId: string): Promise<string | null> {
  const claimToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('publish_jobs')
    .update({ claimed_at: new Date().toISOString(), claim_token: claimToken })
    .eq('id', jobId)
    .in('status', ['scheduled', 'draft', 'failed'])
    .or(staleClaimFilter())
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? claimToken : null
}

async function releasePublishJobClaim(
  supabase: SupabaseClient,
  jobId: string,
  claimToken: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('publish_jobs')
    .update({ ...fields, claimed_at: null, claim_token: null })
    .eq('id', jobId)
    .eq('claim_token', claimToken)
    // Never overwrite a cancellation, a newer stale-reclaimed Worker, or an
    // already-reconciled published row.
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
  if (lower.includes('credential refresh is still in progress')) return 'network'
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

/**
 * Resolves one workspace/platform credential and refreshes it when needed.
 * Refresh is serialized per social account because providers such as X rotate
 * refresh tokens: concurrent use of the same old refresh token can make a
 * healthy connection look broken. A losing request waits for the winner's DB
 * write and reuses that new credential instead of calling the provider again.
 */
export async function resolveCredentials(
  supabase: SupabaseClient,
  workspaceId: string,
  channel: SocialPlatform,
): Promise<ResolvedCredentials | null> {
  // A reconnect can atomically swap the connected row while this request is
  // waiting on credential refresh. Resolve at most twice so we can follow that
  // new active row without unbounded recursion.
  for (let accountLookupAttempt = 0; accountLookupAttempt < 2; accountLookupAttempt += 1) {
    const { data: account, error: accountError } = await supabase
      .from('social_accounts')
      .select('id, handle, external_account_id')
      .eq('workspace_id', workspaceId)
      .eq('platform', channel)
      .eq('connected', true)
      .maybeSingle()

    if (accountError) throw new Error(accountError.message)
    if (!account) return null

    const stored = await getSocialCredentials(supabase, account.id)
    if (!stored) {
      // The connection may have been swapped between the account read and the
      // credential read. Give one fresh connected-account lookup a chance.
      if (accountLookupAttempt === 0) continue
      return null
    }

    if (!credentialsNeedRefresh(stored)) {
      return resolvedCredentialShape(stored, account)
    }

    if (!stored.refreshToken) {
      throw new Error(`${channel} access token expired and there is no refresh token. Reconnect the account.`)
    }

    const refreshClaimToken = await claimSocialCredentialRefresh(supabase, account.id)
    if (!refreshClaimToken) {
      const refreshedByPeer = await waitForConcurrentCredentialRefresh(supabase, account.id)
      if (refreshedByPeer) return resolvedCredentialShape(refreshedByPeer, account)

      // A successful reconnect may have retired this account while we waited.
      const { data: currentAccount, error: currentAccountError } = await supabase
        .from('social_accounts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('platform', channel)
        .eq('connected', true)
        .maybeSingle()
      if (currentAccountError) throw new Error(currentAccountError.message)
      if (currentAccount && currentAccount.id !== account.id && accountLookupAttempt === 0) continue

      throw new Error('Credential refresh is still in progress. Try again shortly.')
    }

    try {
      // Re-read after acquiring the mutex: another request may have completed
      // a refresh just before we won the insert/reclaim race.
      const latest = await getSocialCredentials(supabase, account.id)
      if (!latest) {
        if (accountLookupAttempt === 0) continue
        return null
      }
      if (!credentialsNeedRefresh(latest)) {
        return resolvedCredentialShape(latest, account)
      }
      if (!latest.refreshToken) {
        throw new Error(`${channel} access token expired and there is no refresh token. Reconnect the account.`)
      }

      const refreshed = await getConnectorAdapter(channel).refreshAccessToken(channel, latest.refreshToken)

      try {
        // Persist before any caller receives the new access token. Some
        // providers rotate refresh tokens, so after this external call the old
        // refresh token may already be dead.
        await saveSocialCredentials(supabase, account.id, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? latest.refreshToken,
          expiresAt: refreshed.expiresAt,
          scopes: refreshed.scopes,
        })
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : 'unknown error'
        throw new Error(
          `${channel} token was refreshed but could not be saved (${detail}). Reconnect the account — the old refresh token may no longer be valid.`,
        )
      }

      return {
        accessToken: refreshed.accessToken,
        handle: account.handle ?? undefined,
        externalAccountId: account.external_account_id ?? undefined,
      }
    } finally {
      // A lock-cleanup DB hiccup must not turn a successfully persisted token
      // refresh into a false user-visible failure; ownership tokens make a
      // stale cleanup harmless, and the row becomes reclaimable after 2 min.
      await releaseSocialCredentialRefresh(supabase, account.id, refreshClaimToken).catch((cause) => {
        console.error(`Failed to release credential refresh claim for social account ${account.id}:`, cause)
      })
    }
  }

  return null
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

  if (error) {
    throw new Error(`Seed assets for ${seedId} could not be read: ${error.message}`)
  }
  if (!rows || rows.length === 0) return null

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
    .createSignedUrl(chosen.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError) {
    throw new Error(`Signed media URL for asset ${chosen.id} could not be created: ${signError.message}`)
  }
  if (!signedData?.signedUrl) {
    throw new Error(`Signed media URL for asset ${chosen.id} was empty`)
  }

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
  const claimToken = await claimPublishJob(supabase, job.id)
  if (!claimToken) {
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
      await releasePublishJobClaim(supabase, job.id, claimToken, {
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
      // Infra/DB/storage failures must surface as retryable network errors —
      // never as a silent "no media" validation failure.
      const media = await resolvePublishMediaMetadata(supabase, job.seedId, job.channel)
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

    // If a human cancelled after the real publish began, or a newer Worker
    // reclaimed this job after our claim became stale, the token-gated release
    // deliberately leaves that newer/terminal state intact. The durable success
    // attempt still records what happened externally.
    await releasePublishJobClaim(supabase, job.id, claimToken, {
      status: 'published',
      published_at: new Date().toISOString(),
      error_message: null,
    })

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
        await releasePublishJobClaim(supabase, job.id, claimToken, {
          status: 'published',
          published_at: new Date().toISOString(),
          error_message: null,
        })
        return { success: true }
      } catch (reconciliationError) {
        console.error(`Confirmed publish for job ${job.id} could not be reconciled:`, reconciliationError)
        // Leave a durable unsafe marker so cancel/retry cannot open a second
        // platform call while the post may already exist externally.
        const unknownMessage =
          'EXTERNAL_RESULT_UNKNOWN: The platform may already have accepted this publish, but local bookkeeping failed. Inspect the channel before publishing again.'
        try {
          await releasePublishJobClaim(supabase, job.id, claimToken, {
            status: 'failed',
            error_message: unknownMessage,
          })
        } catch (markerError) {
          console.error(`Failed to persist EXTERNAL_RESULT_UNKNOWN for publish job ${job.id}:`, markerError)
        }
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

      await releasePublishJobClaim(supabase, job.id, claimToken, { status: 'failed', error_message: message })

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
