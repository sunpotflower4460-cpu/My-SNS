import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { generateReplySuggestionForItem } from '@/lib/services/inbox-reply-generation'

interface GenerateReplyBody {
  workspaceId?: string
  inboxItemId?: string
}

export async function POST(request: NextRequest) {
  let body: GenerateReplyBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, inboxItemId } = body
  if (!workspaceId || !inboxItemId) {
    return NextResponse.json({ error: 'workspaceIdとinboxItemIdは必須です。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })

  const membership = await requireWorkspaceMember(supabase, workspaceId, user.id, 'reply_inbox', 'このワークスペースで返信を作成する権限がありません。')
  if (isNextResponse(membership)) return membership

  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Reply generation service client is unavailable:', cause)
    return NextResponse.json(
      { error: '返信案の生成に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  const outcome = await generateReplySuggestionForItem(supabase, serviceClient, {
    workspaceId,
    inboxItemId,
    userId: user.id,
  })
  return NextResponse.json(outcome.body, { status: outcome.status })
}
