import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { recordPublishAttempt } from '@/lib/repositories/supabase/publish-attempts'
import { getSocialCredentials, saveSocialCredentials } from '@/lib/repositories/supabase/social-credentials'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { classifyFailure } from '@/lib/services/publish-worker'
import type { SocialPlatform } from '@/lib/domain/types'

// Invoked on a schedule (see vercel.json) to execute due, publish_mode='auto'
// publish_jobs. Vercel Cron calls this via GET with an Authorization header
// it sets automatically from the CRON_SECRET env var — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// X and Instagram (PR4) have real adapters; every other channel still fails
// closed with reason "unavailable" via UnavailableSocialConnectorAdapter
// (YouTube/TikTok/note land in PR5). A channel with no connected account in
// this workspace fails closed with reason "auth" rather than attempting a
// call with no credentials.

const BATCH_SIZE = 20

interface DueJobRow {
  id: string
  workspace_id: string
  channel: SocialPlatform
  created_by: string
  draft_revisions: {
    title: string | null
    body: string
    hashtags: string[]
    cta: string | null
    metadata: Record<string, unknown>
  } | null
}

interface ResolvedCredentials {
  accessToken: string
  handle?: string
  externalAccountId?: string
}

/** Not connected, or the connector can't publish yet (throws) → the caller classifies that as an "auth" failure. */
async function resolveCredentials(
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

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return NextResponse.json({ error: 'Worker is not configured (CRON_SECRET unset).' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: dueJobs, error: dueJobsError } = await supabase
    .from('publish_jobs')
    .select('id, workspace_id, channel, created_by, draft_revisions!inner(title, body, hashtags, cta, metadata)')
    .eq('status', 'scheduled')
    .eq('publish_mode', 'auto')
    .lte('scheduled_at', new Date().toISOString())
    .limit(BATCH_SIZE)

  if (dueJobsError) {
    return NextResponse.json({ error: dueJobsError.message }, { status: 500 })
  }

  let succeeded = 0
  let failed = 0

  for (const rawJob of (dueJobs ?? []) as unknown as DueJobRow[]) {
    const revision = rawJob.draft_revisions
    if (!revision) continue

    // Nested try/catch: the inner catch records *why publishing failed*. The
    // outer catch is a safety net for that recording itself failing (e.g. a
    // second Worker invocation racing on the same job's attempt_number) —
    // without it, one job's DB hiccup would throw out of the whole handler
    // and silently abandon every other due job still left in this batch.
    try {
      try {
        const credentials = await resolveCredentials(supabase, rawJob.workspace_id, rawJob.channel)
        if (!credentials) {
          throw new Error(`No connected ${rawJob.channel} account for this workspace. Connect one from Settings.`)
        }

        const adapter = getConnectorAdapter(rawJob.channel)
        const result = await adapter.publish({
          platform: rawJob.channel,
          accessToken: credentials.accessToken,
          handle: credentials.handle,
          externalAccountId: credentials.externalAccountId,
          title: revision.title ?? undefined,
          body: revision.body,
          hashtags: revision.hashtags,
          cta: revision.cta ?? undefined,
          metadata: revision.metadata,
        })

        await recordPublishAttempt(supabase, {
          workspaceId: rawJob.workspace_id,
          publishJobId: rawJob.id,
          status: 'success',
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
        })

        // Guarded on status='scheduled': if a human cancelled this job while
        // it was being processed, this no-ops instead of overwriting the
        // cancellation back to "published".
        await supabase
          .from('publish_jobs')
          .update({ status: 'published', published_at: new Date().toISOString(), error_message: null })
          .eq('id', rawJob.id)
          .eq('status', 'scheduled')

        await supabase.from('audit_logs').insert({
          workspace_id: rawJob.workspace_id,
          actor_id: rawJob.created_by,
          action: 'queue_item_published',
          target_type: 'publish_job',
          target_id: rawJob.id,
          metadata: { channel: rawJob.channel, externalUrl: result.externalUrl },
        })

        succeeded += 1
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Publishing failed.'
        const failureReason = message.includes('No connected') || message.includes('Reconnect the account')
          ? 'auth'
          : classifyFailure(message)

        await recordPublishAttempt(supabase, {
          workspaceId: rawJob.workspace_id,
          publishJobId: rawJob.id,
          status: 'failed',
          failureReason,
          errorMessage: message,
        })

        await supabase
          .from('publish_jobs')
          .update({ status: 'failed', error_message: message })
          .eq('id', rawJob.id)
          .eq('status', 'scheduled')

        await supabase.from('audit_logs').insert({
          workspace_id: rawJob.workspace_id,
          actor_id: rawJob.created_by,
          action: 'queue_item_failed',
          target_type: 'publish_job',
          target_id: rawJob.id,
          metadata: { channel: rawJob.channel, failureReason, errorMessage: message },
        })

        failed += 1
      }
    } catch (unexpected) {
      console.error(`Unexpected error finishing publish_job ${rawJob.id}:`, unexpected)
      failed += 1
    }
  }

  return NextResponse.json({ processed: succeeded + failed, succeeded, failed })
}
