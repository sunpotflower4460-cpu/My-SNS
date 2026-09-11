import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { generateReplySuggestionForItem } from '@/lib/services/inbox-reply-generation'

// Bulk "おすすめ返信" generation: runs the exact same per-item safety
// machinery as /api/inbox/reply/generate (generation lock, auto-job conflict
// check, suggestion reuse window, AI usage-ledger safety check, workspace AI
// budget claim/spend check) once per selected inbox item — never a separate,
// parallel copy of that logic. Deliberately SEQUENTIAL, not parallel: the
// workspace AI budget claim is a single-slot mutex, so firing N requests at
// once would only let one through and 409 the rest. One item finishing
// (including releasing its claims) before the next starts also means a mid-
// batch budget exhaustion is reported per-item instead of racing.
//
// Never sends anything — this only proposes suggested text. Sending still
// goes through /api/inbox/reply/approve per item, one explicit human
// confirmation per item (or per batch, from the review UI), same as before.

const MAX_ITEMS_PER_REQUEST = 20

interface GenerateBulkReplyBody {
  workspaceId?: string
  inboxItemIds?: unknown
}

interface BulkGenerateResultEntry {
  inboxItemId: string
  status: number
  body: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  let body: GenerateBulkReplyBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId } = body
  const inboxItemIds = Array.isArray(body.inboxItemIds)
    ? body.inboxItemIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : null

  if (!workspaceId || !inboxItemIds || inboxItemIds.length === 0) {
    return NextResponse.json({ error: 'workspaceIdと1件以上のinboxItemIdsが必要です。' }, { status: 400 })
  }
  if (inboxItemIds.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json({ error: `一度に処理できるのは${MAX_ITEMS_PER_REQUEST}件までです。選択を絞って再度お試しください。` }, { status: 400 })
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

  const results: BulkGenerateResultEntry[] = []
  for (const inboxItemId of inboxItemIds) {
    const outcome = await generateReplySuggestionForItem(supabase, serviceClient, {
      workspaceId,
      inboxItemId,
      userId: user.id,
    })
    results.push({ inboxItemId, status: outcome.status, body: outcome.body })
  }

  const succeeded = results.filter((r) => r.status >= 200 && r.status < 300).length
  return NextResponse.json({ results, succeeded, failed: results.length - succeeded })
}
