import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { processReplyJob } from '@/lib/services/reply-worker'

// Scheduled reply Worker — the messaging-side twin of /api/publish/run. Invoked
// on a schedule (see vercel.json: daily at 01:00 UTC). Vercel Hobby allows at
// most one cron run per path per day, so a recipient-timed send may wait until
// the next daily tick. Inbox「今すぐ」remains the immediate path. Vercel Cron
// calls this via GET with an Authorization header set from CRON_SECRET.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

const BATCH_SIZE = 20

export const maxDuration = 60

interface DueReplyRow {
  id: string
  workspace_id: string
  platform: string
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

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (cause) {
    console.error('Reply worker service client is unavailable:', cause)
    return NextResponse.json({ error: 'Worker database configuration is unavailable.' }, { status: 503 })
  }

  const { data: dueJobs, error: dueJobsError } = await supabase
    .from('reply_jobs')
    .select('id, workspace_id, platform, inbox_item_id, send_target, reply_text, created_by')
    .eq('status', 'scheduled')
    .in('reply_mode', ['scheduled', 'auto'])
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (dueJobsError) {
    console.error('Failed to load due reply jobs:', dueJobsError)
    return NextResponse.json({ error: 'Worker could not load due reply jobs.' }, { status: 503 })
  }

  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const rawJob of (dueJobs ?? []) as unknown as DueReplyRow[]) {
    // Current DB guards only permit LINE sends, but service-role code must also
    // defend against legacy rows created before those guards existed. Never
    // reinterpret another platform's recipient id as a LINE user id.
    if (rawJob.platform !== 'line') {
      failed += 1
      const errorMessage = `Unsupported reply platform in worker: ${rawJob.platform}`
      const { error: quarantineError } = await supabase
        .from('reply_jobs')
        .update({ status: 'failed', error_message: errorMessage, claimed_at: null, claim_token: null })
        .eq('id', rawJob.id)
        .eq('status', 'scheduled')
      if (quarantineError) {
        console.error(`Failed to quarantine legacy reply job ${rawJob.id}:`, quarantineError)
      } else {
        console.error(`Quarantined legacy non-LINE reply job ${rawJob.id}: ${rawJob.platform}`)
      }
      continue
    }

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
      failed += 1
      console.error(`Unhandled reply worker error for job ${rawJob.id}:`, cause)
    }
  }

  return NextResponse.json({ processed: succeeded + failed, succeeded, failed, skipped })
}
