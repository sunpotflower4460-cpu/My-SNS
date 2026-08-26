import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processReplyJob } from '@/lib/services/reply-worker'

// Scheduled reply Worker — the messaging-side twin of /api/publish/run. Invoked
// on a schedule (see vercel.json) to send due reply_jobs whose recipient-
// appropriate time has arrived. Vercel Cron calls this via GET with an
// Authorization header set from CRON_SECRET.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

const BATCH_SIZE = 20

// A text push is quick (no media upload), so the default is plenty — unlike the
// publish Worker, which needs a long ceiling for video uploads.
export const maxDuration = 60

interface DueReplyRow {
  id: string
  workspace_id: string
  platform: 'line'
  inbox_item_id: string
  send_target: string
  reply_text: string
  created_by: string
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
    .from('reply_jobs')
    .select('id, workspace_id, platform, inbox_item_id, send_target, reply_text, created_by')
    .eq('status', 'scheduled')
    .in('reply_mode', ['scheduled', 'auto'])
    .lte('scheduled_at', new Date().toISOString())
    // Deterministic FIFO among due replies. Without this, a busy table can
    // repeatedly surface newer rows in the 20-row window and starve older DMs.
    .order('scheduled_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (dueJobsError) {
    return NextResponse.json({ error: dueJobsError.message }, { status: 500 })
  }

  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const rawJob of (dueJobs ?? []) as unknown as DueReplyRow[]) {
    try {
      const result = await processReplyJob(supabase, {
        id: rawJob.id,
        workspaceId: rawJob.workspace_id,
        platform: 'line',
        inboxItemId: rawJob.inbox_item_id,
        sendTarget: rawJob.send_target,
        replyText: rawJob.reply_text,
        createdBy: rawJob.created_by,
      })

      if (result.skipped) skipped += 1
      else if (result.success) succeeded += 1
      else failed += 1
    } catch (cause) {
      // Keep the cron batch progressing even if claiming this one row fails
      // because of a transient database error. Later jobs are independent.
      failed += 1
      console.error(`Unhandled reply worker error for job ${rawJob.id}:`, cause)
    }
  }

  return NextResponse.json({ processed: succeeded + failed, succeeded, failed, skipped })
}
