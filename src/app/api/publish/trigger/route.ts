import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { recordPublishAttempt } from '@/lib/repositories/supabase/publish-attempts'
import { processPublishJob, resolveCredentials, type PublishableJob } from '@/lib/services/publish-worker'
import { checkTikTokPublishStatus, parseTikTokPendingPublishId } from '@/lib/services/connectors/tiktok-connector'
import { getPublishingStrategy } from '@/lib/channels/config'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

// Manually attempts one API-first job right now. In zero-cost mode this route
// refuses before touching external connectors, so an old assisted/draft job or
// a direct HTTP request cannot accidentally incur an API posting cost.

export const maxDuration = 300

interface TriggerRequestBody {
  workspaceId?: string
  jobId?: string
}

interface TriggerJob {
  id: string
  workspace_id: string
  channel: PublishableJob['channel']
  created_by: string
  seed_id: string | null
  publish_mode: string
  status: string
  error_message: string | null
  draft_revisions: PublishableJob['revision']
}

function isUnsafeExternalRetry(errorMessage: string | null): boolean {
  return Boolean(
    errorMessage?.startsWith('PARTIAL_EXTERNAL_SUCCESS:')
      || errorMessage?.startsWith('EXTERNAL_RESULT_UNKNOWN:'),
  )
}

async function reconcilePendingTikTokPublish(
  serviceClient: SupabaseClient,
  job: TriggerJob,
  publishId: string,
): Promise<NextResponse | null> {
  const credentials = await resolveCredentials(serviceClient, job.workspace_id, 'tiktok')
  if (!credentials) {
    return NextResponse.json({ error: 'TikTokアカウントが接続されていません。設定から再接続してください。' }, { status: 409 })
  }

  const check = await checkTikTokPublishStatus(credentials.accessToken, publishId)
  if (check.state === 'processing') {
    return NextResponse.json(
      {
        success: false,
        error: 'TikTok側で前回の投稿をまだ処理中です。新しい投稿は作成していません。少し後でもう一度確認してください。',
      },
      { status: 409 },
    )
  }

  if (check.state === 'complete') {
    // Persist the success attempt before (or without relying on) the job-row
    // update. Never return reconciled success when the durable ledger write fails.
    await recordPublishAttempt(serviceClient, {
      workspaceId: job.workspace_id,
      publishJobId: job.id,
      status: 'success',
      externalPostId: check.postId ?? publishId,
    })

    const publishedAt = new Date().toISOString()
    const { data: completed, error } = await serviceClient
      .from('publish_jobs')
      .update({
        status: 'published',
        published_at: publishedAt,
        error_message: null,
        claimed_at: null,
        claim_token: null,
      })
      .eq('id', job.id)
      .eq('workspace_id', job.workspace_id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!completed) {
      const { data: current, error: currentError } = await serviceClient
        .from('publish_jobs')
        .select('status')
        .eq('id', job.id)
        .eq('workspace_id', job.workspace_id)
        .maybeSingle()
      if (currentError) throw new Error(currentError.message)
      if (current?.status === 'published') return NextResponse.json({ success: true, reconciled: true })
      return NextResponse.json({ error: 'この投稿の状態が変更されました。公開予定を再読み込みしてください。' }, { status: 409 })
    }

    await serviceClient.from('audit_logs').insert({
      workspace_id: job.workspace_id,
      actor_id: job.created_by,
      action: 'queue_item_published',
      target_type: 'publish_job',
      target_id: job.id,
      metadata: { channel: 'tiktok', reconciled: true, publishId, externalPostId: check.postId ?? null },
    }).then(({ error: auditError }) => {
      if (auditError) console.error(`Failed to audit reconciled TikTok success for ${job.id}:`, auditError)
    })

    return NextResponse.json({ success: true, reconciled: true })
  }

  return null
}

export async function POST(request: NextRequest) {
  let body: TriggerRequestBody
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
  if (!role || !hasPermission(role, 'manage_queue')) {
    return NextResponse.json({ error: 'このワークスペースで公開する権限がありません。' }, { status: 403 })
  }

  if (getPublishingStrategy() === 'zero-cost') {
    return NextResponse.json(
      { error: '無料投稿モードでは外部投稿APIを実行しません。公開予定画面の「○○へ投稿」から投稿画面を開いてください。' },
      { status: 409 },
    )
  }

  const { data: job, error: jobError } = await supabase
    .from('publish_jobs')
    .select('id, workspace_id, channel, created_by, seed_id, publish_mode, status, error_message, draft_revisions!inner(title, body, hashtags, cta, metadata)')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'ジョブが見つかりません。' }, { status: 404 })
  }
  if (job.publish_mode === 'manual' || job.publish_mode === 'owned') {
    return NextResponse.json({ error: `${job.publish_mode}のジョブは手動で完了させるものです（自動実行の対象外です）。` }, { status: 400 })
  }
  if (job.status !== 'scheduled' && job.status !== 'draft' && job.status !== 'failed') {
    return NextResponse.json({ error: `このジョブはすでに${job.status}の状態です。` }, { status: 400 })
  }

  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Publish trigger service client is unavailable:', cause)
    return NextResponse.json(
      { error: '公開処理に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  const typedJob = job as unknown as TriggerJob

  if (typedJob.status === 'failed' && isUnsafeExternalRetry(typedJob.error_message)) {
    return NextResponse.json(
      {
        error:
          '前回の投稿は外部サービス上で一部成功したか、成功したかどうか判定できない状態です。二重投稿を防ぐため再実行を停止しています。媒体側を確認し、このジョブをキャンセルして、必要なら新しいRevisionから明示的に公開してください。',
      },
      { status: 409 },
    )
  }

  const pendingTikTokId = typedJob.channel === 'tiktok' && typedJob.status === 'failed'
    ? parseTikTokPendingPublishId(typedJob.error_message)
    : null

  if (pendingTikTokId) {
    try {
      const reconciliation = await reconcilePendingTikTokPublish(serviceClient, typedJob, pendingTikTokId)
      if (reconciliation) return reconciliation
    } catch (cause) {
      console.error(`Failed to reconcile pending TikTok publish for job ${typedJob.id}:`, cause)
      return NextResponse.json(
        { error: 'TikTok上の前回投稿の状態を確認できませんでした。安全のため新しい投稿は作成していません。' },
        { status: 503 },
      )
    }
  }

  const revision = typedJob.draft_revisions

  let result
  try {
    result = await processPublishJob(serviceClient, {
      id: typedJob.id,
      workspaceId: typedJob.workspace_id,
      channel: typedJob.channel,
      createdBy: typedJob.created_by,
      seedId: typedJob.seed_id ?? undefined,
      revision,
    })
  } catch (cause) {
    // Do not expose PostgREST/Supabase internals to the browser. The detailed
    // error remains in server logs for diagnosis.
    console.error(`Failed to start publish processing for job ${typedJob.id}:`, cause)
    return NextResponse.json(
      { error: '公開処理を開始できませんでした。通信状態を確認してからもう一度お試しください。' },
      { status: 503 },
    )
  }

  if (result.skipped) {
    return NextResponse.json({ error: 'このジョブは現在別の処理で公開中です。少し待ってから状態を再読み込みしてください。' }, { status: 409 })
  }

  return NextResponse.json({ success: result.success }, { status: result.success ? 200 : 502 })
}
