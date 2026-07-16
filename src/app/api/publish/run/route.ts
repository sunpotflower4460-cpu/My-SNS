import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { recordPublishAttempt } from '@/lib/repositories/supabase/publish-attempts'
import { UnavailableSocialConnectorAdapter } from '@/lib/services/social-connector'
import { classifyFailure } from '@/lib/services/publish-worker'
import type { SocialPlatform } from '@/lib/domain/types'

// Invoked on a schedule (see vercel.json) to execute due, publish_mode='auto'
// publish_jobs. Vercel Cron calls this via GET with an Authorization header
// it sets automatically from the CRON_SECRET env var — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// No real per-platform adapter exists yet (that's PR4/PR5), so every
// attempt today fails closed with reason "unavailable" — this route wires
// the scheduling/attempt/audit machinery ahead of the connectors landing,
// rather than faking a successful publish.

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

  const adapter = new UnavailableSocialConnectorAdapter()
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
        const result = await adapter.publish({
          platform: rawJob.channel,
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
        const failureReason = classifyFailure(message)

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
