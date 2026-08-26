import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processReplyJob } from '@/lib/services/reply-worker'
import { isLineResultUnknownError } from '@/lib/services/connectors/line-connector'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

// Sends one reply job right now, regardless of scheduled_at — the messaging-side
// twin of /api/publish/trigger. Used for "Send now" on an already-scheduled
// reply and for retrying a failed send. Only LINE sends in Phase 1.

export const maxDuration = 60

interface TriggerReplyBody {
  workspaceId?: string
  jobId?: string
}

export async function POST(request: NextRequest) {
  let body: TriggerReplyBody
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
  if (!role || !hasPermission(role, 'reply_inbox')) {
    return NextResponse.json({ error: 'このワークスペースで返信する権限がありません。' }, { status: 403 })
  }

  // RLS-scoped to the caller's own workspace even though the send below uses the
  // service-role client (needed for credentials + append-only attempt writes).
  const { data: job, error: jobError } = await supabase
    .from('reply_jobs')
    .select('id, workspace_id, platform, inbox_item_id, send_target, reply_text, created_by, status, error_message')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: '返信ジョブが見つかりません。' }, { status: 404 })
  }
  if (job.platform !== 'line') {
    return NextResponse.json({ error: `${job.platform}への送信は未対応です。` }, { status: 409 })
  }
  if (job.status !== 'scheduled' && job.status !== 'failed') {
    return NextResponse.json({ error: `この返信はすでに${job.status}の状態です。` }, { status: 400 })
  }

  if (job.status === 'failed' && isLineResultUnknownError(job.error_message)) {
    return NextResponse.json(
      {
        error:
          '前回のLINE送信は「相手に届いたか判定できない」状態です。二重送信を防ぐため自動再送は停止しています。LINE側・相手との会話を確認してから、必要なら新しい返信として明示的に作成してください。',
      },
      { status: 409 },
    )
  }

  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Reply trigger service client is unavailable:', cause)
    return NextResponse.json(
      { error: '返信処理に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  let result
  try {
    result = await processReplyJob(serviceClient, {
      id: job.id,
      workspaceId: job.workspace_id,
      platform: 'line',
      inboxItemId: job.inbox_item_id,
      sendTarget: job.send_target,
      replyText: job.reply_text,
      createdBy: job.created_by,
    })
  } catch (cause) {
    console.error(`Unhandled reply trigger error for job ${job.id}:`, cause)
    return NextResponse.json(
      { error: '返信処理を開始できませんでした。データベース接続を確認してから再試行してください。' },
      { status: 503 },
    )
  }

  if (result.skipped) {
    return NextResponse.json(
      { ...result, error: 'ちょうど別の送信処理が進行中です。しばらくしてからもう一度お試しください。' },
      { status: 409 },
    )
  }
  if (!result.success) {
    return NextResponse.json(
      { ...result, error: '返信の送信に失敗しました。受信箱で詳細を確認してください。' },
      { status: 502 },
    )
  }

  return NextResponse.json(result)
}
