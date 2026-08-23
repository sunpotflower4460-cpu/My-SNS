import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'

interface DisconnectRequestBody {
  workspaceId?: string
  accountId?: string
}

interface DisconnectedAccountRow {
  id: string
  workspace_id: string
  platform: SocialPlatform
  handle: string
  connected: boolean
  connected_at: string | null
  external_account_id: string | null
  updated_at: string
}

function mapDisconnectedAccount(row: DisconnectedAccountRow): SocialAccount {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    handle: row.handle,
    connected: row.connected,
    connectedAt: row.connected_at ?? undefined,
    externalAccountId: row.external_account_id ?? undefined,
    updatedAt: row.updated_at,
  }
}

export async function POST(request: NextRequest) {
  let body: DisconnectRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, accountId } = body
  if (!workspaceId || !accountId) {
    return NextResponse.json({ error: 'workspaceIdとaccountIdは必須です。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })
  }

  // The RPC rechecks owner/admin, locks the account row, marks it disconnected,
  // and deletes the encrypted credential in the same database transaction.
  // This prevents a disconnected account from retaining a secret credential if
  // a second independent database request fails.
  const { data, error: disconnectError } = await supabase.rpc('disconnect_social_account', {
    p_workspace_id: workspaceId,
    p_account_id: accountId,
  })

  if (disconnectError || !data) {
    const status = disconnectError?.code === '42501'
      ? 403
      : disconnectError?.code === 'P0002'
        ? 404
        : 500
    const error = status === 403
      ? 'このアカウントの接続を解除する権限がありません。'
      : status === 404
        ? 'アカウントが見つかりません。'
        : 'アカウントの接続解除を完了できませんでした。'
    return NextResponse.json({ error }, { status })
  }

  const account = mapDisconnectedAccount(data as DisconnectedAccountRow)

  const { error: auditError } = await supabase.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    action: 'social_account_disconnected',
    target_type: 'social_account',
    target_id: accountId,
    metadata: { platform: account.platform, handle: account.handle },
  })
  if (auditError) {
    // The authoritative disconnect already committed atomically. Audit logging
    // is observability and must not turn that completed action into a false 500.
    console.error('Failed to audit social account disconnect:', auditError)
  }

  return NextResponse.json({ account })
}
