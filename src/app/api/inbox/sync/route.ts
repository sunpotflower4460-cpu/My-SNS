import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveCredentials } from '@/lib/services/publish-worker'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { upsertInboxItems } from '@/lib/repositories/supabase/inbox-ingest'
import { hasPermission } from '@/lib/permissions'
import type { SocialPlatform, WorkspaceRole } from '@/lib/domain/types'

interface SyncRequestBody {
  workspaceId?: string
  platform?: SocialPlatform
}

export async function POST(request: NextRequest) {
  let body: SyncRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, platform } = body
  if (!workspaceId || !platform) {
    return NextResponse.json({ error: 'workspaceIdとplatformは必須です。' }, { status: 400 })
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
  if (!role || !hasPermission(role, 'manage_social_accounts')) {
    return NextResponse.json({ error: 'このワークスペースで受信箱を同期する権限がありません。' }, { status: 403 })
  }

  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Inbox sync service client is unavailable:', cause)
    return NextResponse.json(
      { error: '受信箱同期に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  let credentials
  try {
    credentials = await resolveCredentials(serviceClient, workspaceId, platform)
  } catch (cause) {
    console.error(`Failed to resolve ${platform} credentials for inbox sync:`, cause)
    return NextResponse.json(
      { error: 'SNSの認証情報を確認できませんでした。設定画面で接続状態を確認してから再試行してください。' },
      { status: 502 },
    )
  }
  if (!credentials) {
    return NextResponse.json({ error: `このワークスペースには接続済みの${platform}アカウントがありません。` }, { status: 400 })
  }

  try {
    const events = await getConnectorAdapter(platform).fetchInbox({
      platform,
      accessToken: credentials.accessToken,
      externalAccountId: credentials.externalAccountId,
      handle: credentials.handle,
    })
    const ingested = await upsertInboxItems(serviceClient, workspaceId, events)
    return NextResponse.json({ ingested })
  } catch (cause) {
    // Connector feature-gap messages are useful to the creator (for example
    // "Instagram uses webhook push"), but provider/DB internals belong in logs.
    const detail = cause instanceof Error ? cause.message : '同期に失敗しました。'
    console.error(`Inbox sync failed for ${platform}:`, cause)
    const safeMessage =
      detail.includes('not available')
      || detail.includes('via webhook')
      || detail.includes('no direct-message API')
      || detail.includes('有料API')
        ? detail
        : '受信箱の同期に失敗しました。接続状態と通信状況を確認してから再試行してください。'
    return NextResponse.json({ error: safeMessage }, { status: 502 })
  }
}
