import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processPublishJob, type PublishableJob } from '@/lib/services/publish-worker'
import { getPublishingStrategy } from '@/lib/channels/config'
import type { SocialPlatform } from '@/lib/domain/types'

// Invoked on a schedule (see vercel.json) to execute due, publish_mode='auto'
// publish_jobs. The zero-cost strategy hard-disables this external publishing
// path even if an older auto job still exists in the database. api-first is an
// explicit opt-in that preserves the OAuth connector behaviour.

const BATCH_SIZE = 20

// YouTube uploads can run long. 300s needs a Vercel Pro (or higher) plan —
// on Hobby a large upload can still exceed platform limits. This duration is
// irrelevant in zero-cost mode because no external upload is attempted.
export const maxDuration = 300

interface DueJobRow {
  id: string
  workspace_id: string
  channel: SocialPlatform
  created_by: string
  seed_id: string | null
  draft_revisions: PublishableJob['revision'] | null
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return NextResponse.json({ error: 'Worker is not configured (CRON_SECRET unset).' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }

  if (getPublishingStrategy() === 'zero-cost') {
    return NextResponse.json({
      mode: 'zero-cost',
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      message: 'External publishing worker is disabled in zero-cost mode.',
    })
  }

  const supabase = createServiceClient()

  const { data: dueJobs, error: dueJobsError } = await supabase
    .from('publish_jobs')
    .select('id, workspace_id, channel, created_by, seed_id, draft_revisions!inner(title, body, hashtags, cta, metadata)')
    .eq('status', 'scheduled')
    .eq('publish_mode', 'auto')
    .lte('scheduled_at', new Date().toISOString())
    // Always drain the oldest obligations first. Without an explicit order,
    // Postgres may return any 20 due rows and a busy/newer subset can starve
    // older scheduled posts indefinitely across cron ticks.
    .order('scheduled_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (dueJobsError) {
    return NextResponse.json({ error: dueJobsError.message }, { status: 500 })
  }

  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const rawJob of (dueJobs ?? []) as unknown as DueJobRow[]) {
    if (!rawJob.draft_revisions) {
      failed += 1
      console.error(`publish_job ${rawJob.id} has no linked draft revision; skipping.`)
      continue
    }

    try {
      const result = await processPublishJob(supabase, {
        id: rawJob.id,
        workspaceId: rawJob.workspace_id,
        channel: rawJob.channel,
        createdBy: rawJob.created_by,
        seedId: rawJob.seed_id ?? undefined,
        revision: rawJob.draft_revisions,
      })

      if (result.skipped) skipped += 1
      else if (result.success) succeeded += 1
      else failed += 1
    } catch (cause) {
      // processPublishJob is designed to contain per-job failures, but its
      // initial claim itself can still fail on a transient database error.
      // Never let one such failure abort the remaining due jobs in this tick.
      failed += 1
      console.error(`Unhandled publish worker error for job ${rawJob.id}:`, cause)
    }
  }

  return NextResponse.json({ mode: 'api-first', processed: succeeded + failed, succeeded, failed, skipped })
}
