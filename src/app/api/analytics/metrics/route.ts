import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveCredentials } from '@/lib/services/publish-worker'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

// Live, read-only engagement lookup for one already-published job — never
// cached (see PostMetrics), and read access only (view_queue), unlike the
// manage_social_accounts-gated actions elsewhere under /api/social and
// /api/inbox. Fails closed with the platform's real reason when a connector
// has no metrics endpoint (Instagram/TikTok) rather than returning zeros.

interface MetricsRequestBody {
  workspaceId?: string
  jobId?: string
}

export async function POST(request: NextRequest) {
  let body: MetricsRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, jobId } = body
  if (!workspaceId || !jobId) {
    return NextResponse.json({ error: 'workspaceIdとjobIdは必須です。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'view_queue')) {
    return NextResponse.json({ error: 'このワークスペースを閲覧する権限がありません。' }, { status: 403 })
  }

  const { data: job, error: jobError } = await supabase
    .from('publish_jobs')
    .select('id, channel')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'ジョブが見つかりません。' }, { status: 404 })
  }

  const { data: attempt } = await supabase
    .from('publish_attempts')
    .select('external_post_id')
    .eq('publish_job_id', jobId)
    .eq('status', 'success')
    .not('external_post_id', 'is', null)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!attempt?.external_post_id) {
    return NextResponse.json({ error: 'このジョブには指標を取得できる公開済みの投稿記録がありません。' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  let credentials
  try {
    credentials = await resolveCredentials(serviceClient, workspaceId, job.channel)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '認証情報を取得できませんでした。' }, { status: 502 })
  }
  if (!credentials) {
    return NextResponse.json({ error: `このワークスペースには接続済みの${job.channel}アカウントがありません。` }, { status: 400 })
  }

  try {
    const metrics = await getConnectorAdapter(job.channel).fetchMetrics({
      platform: job.channel,
      accessToken: credentials.accessToken,
      externalAccountId: credentials.externalAccountId,
      handle: credentials.handle,
      postId: attempt.external_post_id,
    })
    return NextResponse.json(metrics)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '指標を取得できませんでした。' }, { status: 502 })
  }
}
