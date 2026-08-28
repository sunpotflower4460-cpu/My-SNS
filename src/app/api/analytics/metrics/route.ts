import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveCredentials } from '@/lib/services/publish-worker'
import { getConnectorAdapter } from '@/lib/services/connectors'

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
  if (!user) return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })

  const membership = await requireWorkspaceMember(supabase, workspaceId, user.id, 'view_queue', 'このワークスペースを閲覧する権限がありません。')
  if (isNextResponse(membership)) return membership

  const { data: job, error: jobError } = await supabase
    .from('publish_jobs')
    .select('id, channel')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (jobError) {
    return NextResponse.json({ error: 'ジョブを確認できませんでした。少し後でもう一度お試しください。' }, { status: 503 })
  }
  if (!job) return NextResponse.json({ error: 'ジョブが見つかりません。' }, { status: 404 })

  const { data: attempt, error: attemptError } = await supabase
    .from('publish_attempts')
    .select('external_post_id')
    .eq('publish_job_id', jobId)
    .eq('status', 'success')
    .not('external_post_id', 'is', null)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (attemptError) {
    console.error('Failed to load publish attempt for metrics:', attemptError)
    return NextResponse.json(
      { error: '公開記録を確認できないため、安全のため指標取得を中止しました。少し待ってから再試行してください。' },
      { status: 503 },
    )
  }

  if (!attempt?.external_post_id) {
    return NextResponse.json({ error: 'このジョブには指標を取得できる公開済みの投稿記録がありません。' }, { status: 400 })
  }

  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Metrics service client is unavailable:', cause)
    return NextResponse.json(
      { error: '指標取得に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  let credentials
  try {
    credentials = await resolveCredentials(serviceClient, workspaceId, job.channel)
  } catch (cause) {
    console.error(`Failed to resolve ${job.channel} credentials for metrics:`, cause)
    return NextResponse.json(
      { error: 'SNSの認証情報を確認できませんでした。設定画面で接続状態を確認してから再試行してください。' },
      { status: 502 },
    )
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
    const detail = cause instanceof Error ? cause.message : '指標を取得できませんでした。'
    console.error(`Metrics lookup failed for ${job.channel} job ${jobId}:`, cause)
    // Keep honest product-capability gaps visible while hiding provider/DB
    // internals for unexpected operational failures.
    const safeMessage =
      detail.includes('not available')
      || detail.includes('not yet request')
      || detail.includes('separate application review')
      || detail.includes('有料API')
        ? detail
        : '指標を取得できませんでした。接続状態と通信状況を確認してから再試行してください。'
    return NextResponse.json({ error: safeMessage }, { status: 502 })
  }
}
