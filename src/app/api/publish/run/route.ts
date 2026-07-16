import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processPublishJob, type PublishableJob } from '@/lib/services/publish-worker'
import type { SocialPlatform } from '@/lib/domain/types'

// Invoked on a schedule (see vercel.json) to execute due, publish_mode='auto'
// publish_jobs. Vercel Cron calls this via GET with an Authorization header
// it sets automatically from the CRON_SECRET env var — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// X and Instagram (PR4) and YouTube/TikTok (PR5) have real adapters; note
// still never reaches this route (publish_mode='manual', completed by a
// human from the Queue). YouTube/TikTok start as 'assisted'/'draft', not
// 'auto' — they're triggered manually via /api/publish/trigger instead of
// this scheduled batch; see PublishMode's doc comment for why.

const BATCH_SIZE = 20

interface DueJobRow {
  id: string
  workspace_id: string
  channel: SocialPlatform
  created_by: string
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
    if (!rawJob.draft_revisions) continue

    const { success } = await processPublishJob(supabase, {
      id: rawJob.id,
      workspaceId: rawJob.workspace_id,
      channel: rawJob.channel,
      createdBy: rawJob.created_by,
      revision: rawJob.draft_revisions,
    })

    if (success) succeeded += 1
    else failed += 1
  }

  return NextResponse.json({ processed: succeeded + failed, succeeded, failed })
}
