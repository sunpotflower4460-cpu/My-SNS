import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  deletePendingSocialAccount,
  finalizeSocialAccountConnection,
  getSocialAccountById,
  upsertPendingSocialAccount,
} from '@/lib/repositories/supabase/social-accounts'
import { deleteSocialCredentials, saveSocialCredentials } from '@/lib/repositories/supabase/social-credentials'
import { getConnectorAdapter, isLineConfigured } from '@/lib/services/connectors'
import { finalizeSocialConnectionWithCleanup } from '@/lib/services/social-connection-finalization'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

// LINE connects with a channel access token from the environment, not an OAuth
// redirect — so this is a plain POST, not the GET authorize/callback dance the
// other platforms use. It still reuses the same pending→credentials→finalize
// ordering so Settings can never show "接続済み" without a working token.

interface ConnectBody {
  workspaceId?: string
}

export async function POST(request: NextRequest) {
  let body: ConnectBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId } = body
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceIdは必須です。' }, { status: 400 })
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
    return NextResponse.json({ error: 'あなたの役割ではSNSアカウントを接続できません。' }, { status: 403 })
  }

  if (!isLineConfigured()) {
    return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKENが未設定です。デプロイの環境変数を設定してください。' }, { status: 400 })
  }

  let pendingAccountId: string | null = null

  try {
    const adapter = getConnectorAdapter('line')
    // LINE ignores authCode/redirectUri — it reads the channel token from env
    // and resolves the bot's own userId.
    const connected = await adapter.connect('line', '', { redirectUri: '' })

    const account = await upsertPendingSocialAccount(supabase, {
      workspaceId,
      platform: 'line',
      handle: connected.handle,
      externalAccountId: connected.externalAccountId,
    })
    pendingAccountId = account.id

    const serviceClient = createServiceClient()
    await saveSocialCredentials(serviceClient, account.id, {
      accessToken: connected.accessToken,
      refreshToken: connected.refreshToken,
      expiresAt: connected.expiresAt,
      scopes: connected.scopes,
    })

    const finalizedAccount = await finalizeSocialConnectionWithCleanup({
      finalize: async () => finalizeSocialAccountConnection(supabase, account.id),
      verifyFinalized: async () => {
        // Use service-role verification so a simultaneous membership/RLS change
        // cannot hide a successfully committed row and trick cleanup into
        // deleting the credential of the live LINE connection.
        const current = await getSocialAccountById(serviceClient, account.id)
        return current?.connected ? current : null
      },
      cleanup: async () => { await deleteSocialCredentials(serviceClient, account.id) },
      onVerificationError: (verificationCause) => {
        console.error('Could not verify whether LINE connection finalization committed:', verificationCause)
      },
      onCleanupError: (cleanupCause) => {
        console.error('Failed to clean credentials after LINE connection finalization failed:', cleanupCause)
      },
    })

    pendingAccountId = null

    const { error: auditError } = await supabase.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: 'line_account_connected',
      target_type: 'social_account',
      target_id: account.id,
      metadata: { platform: 'line', handle: connected.handle },
    })
    if (auditError) {
      console.error('Failed to audit LINE social account connection:', auditError)
    }

    // Return the finalized row, not the disconnected staging snapshot created
    // before the credential write. This keeps client state immediately aligned
    // with the durable DB connection without requiring a page reload.
    return NextResponse.json({ account: finalizedAccount })
  } catch (cause) {
    if (pendingAccountId) {
      await deletePendingSocialAccount(supabase, pendingAccountId).catch((cleanupCause) => {
        console.error('Failed to remove pending LINE account after connection failure:', cleanupCause)
      })
    }

    const message = cause instanceof Error ? cause.message : 'LINEの接続を完了できませんでした。'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
