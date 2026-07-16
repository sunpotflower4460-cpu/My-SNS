import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deleteSocialCredentials } from '@/lib/repositories/supabase/social-credentials'

interface DisconnectRequestBody {
  workspaceId?: string
  accountId?: string
}

// Deleting the encrypted credential row requires the service-role client
// (social_account_credentials has no client-facing RLS policy at all), so
// disconnect can't be a plain browser-side Supabase call the way most other
// mutations in this app are — it has to go through a server route.
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

  // RLS (owner/admin only) both scopes this to the caller's workspace and
  // enforces manage_social_accounts — a lower role gets zero rows back.
  const { data: account, error: updateError } = await supabase
    .from('social_accounts')
    .update({ connected: false })
    .eq('id', accountId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (updateError || !account) {
    return NextResponse.json({ error: 'アカウントが見つからないか、接続を解除する権限がありません。' }, { status: 404 })
  }

  const serviceClient = createServiceClient()
  await deleteSocialCredentials(serviceClient, accountId)

  await supabase.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    action: 'social_account_disconnected',
    target_type: 'social_account',
    target_id: accountId,
    metadata: { platform: account.platform, handle: account.handle },
  })

  return NextResponse.json({ account })
}
