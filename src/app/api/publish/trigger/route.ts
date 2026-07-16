import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processPublishJob, type PublishableJob } from '@/lib/services/publish-worker'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

// Manually attempts one job right now, regardless of scheduled_at. Exists
// because YouTube ('assisted') and TikTok ('draft') jobs are deliberately
// never picked up by the scheduled Worker (/api/publish/run only processes
// publish_mode='auto') — this is how a human actually pushes one of those
// jobs to the platform. 'manual' channels (note) never come through here;
// they're completed via /api/publish/run's sibling flow, marking the job
// posted by hand from the Queue.

interface TriggerRequestBody {
  workspaceId?: string
  jobId?: string
}

export async function POST(request: NextRequest) {
  let body: TriggerRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { workspaceId, jobId } = body
  if (!workspaceId || !jobId) {
    return NextResponse.json({ error: 'workspaceId and jobId are required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'manage_queue')) {
    return NextResponse.json({ error: 'Not permitted to publish in this workspace.' }, { status: 403 })
  }

  // RLS-scoped to the caller's own workspace even though the rest of this
  // route uses the service-role client below (needed for credentials access).
  const { data: job, error: jobError } = await supabase
    .from('publish_jobs')
    .select('id, workspace_id, channel, created_by, publish_mode, status, draft_revisions!inner(title, body, hashtags, cta, metadata)')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  if (job.publish_mode === 'manual' || job.publish_mode === 'owned') {
    return NextResponse.json({ error: `${job.publish_mode} jobs are completed by hand, not triggered.` }, { status: 400 })
  }
  if (job.status !== 'scheduled' && job.status !== 'draft' && job.status !== 'failed') {
    return NextResponse.json({ error: `Job is already ${job.status}.` }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const revision = job.draft_revisions as unknown as PublishableJob['revision']
  const result = await processPublishJob(serviceClient, {
    id: job.id,
    workspaceId: job.workspace_id,
    channel: job.channel,
    createdBy: job.created_by,
    revision,
  })

  return NextResponse.json(result)
}
