import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { listConnectedSocialAccounts, resolveCredentials } from '@/lib/services/publish-worker'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { syncInboxForAccounts } from '@/lib/services/inbox-sync'
import { upsertInboxItems } from '@/lib/repositories/supabase/inbox-ingest'
import type { SocialPlatform } from '@/lib/domain/types'

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

  const membership = await requireWorkspaceMember(supabase, workspaceId, user.id, 'manage_social_accounts', 'このワークスペースで受信箱を同期する権限がありません。')
  if (isNextResponse(membership)) return membership

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

  let accounts
  try {
    accounts = await listConnectedSocialAccounts(serviceClient, workspaceId, platform)
  } catch (cause) {
    console.error(`Failed to list ${platform} accounts for inbox sync:`, cause)
    return NextResponse.json(
      { error: 'SNSの接続状態を確認できませんでした。設定画面で接続状態を確認してから再試行してください。' },
      { status: 502 },
    )
  }
  if (accounts.length === 0) {
    return NextResponse.json({ error: `このワークスペースには接続済みの${platform}アカウントがありません。` }, { status: 400 })
  }

  const result = await syncInboxForAccounts({
    accounts,
    syncAccount: async (account) => {
      const credentials = await resolveCredentials(serviceClient, workspaceId, platform, account.id)
      if (!credentials) return null
      return getConnectorAdapter(platform).fetchInbox({
        platform,
        accessToken: credentials.accessToken,
        externalAccountId: credentials.externalAccountId,
        handle: credentials.handle,
      })
    },
    ingest: (events) => upsertInboxItems(serviceClient, workspaceId, events),
    onError: (account, cause) => {
      console.error(`Inbox sync failed for ${platform} account ${account.id}:`, cause)
    },
  })

  // One account failing (for example a credential refresh) must not hide what
  // the other accounts ingested. Only when nothing succeeded is it an error.
  if (result.succeededAccounts === 0) {
    return NextResponse.json(
      { error: result.failures[0]?.message ?? '受信箱の同期に失敗しました。接続状態と通信状況を確認してから再試行してください。', failures: result.failures },
      { status: 502 },
    )
  }
  return NextResponse.json({ ingested: result.ingested, failures: result.failures })
}
