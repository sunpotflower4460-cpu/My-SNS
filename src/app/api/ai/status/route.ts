import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { getAiStatus } from '@/lib/services/llm-status'

// Which AI provider/model is active for this deployment. Signed-in workspace
// members with settings access only; never returns a key.
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceIdが必要です。' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })

  const membership = await requireWorkspaceMember(supabase, workspaceId, user.id, 'view_settings', '設定を閲覧する権限がありません。')
  if (isNextResponse(membership)) return membership

  return NextResponse.json(getAiStatus(), { headers: { 'Cache-Control': 'no-store' } })
}
