import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { readJsonBodyWithLimit } from '@/lib/api/read-json'
import { requireWorkspaceMember } from '@/lib/api/workspace-access'
import { museJson, museUnavailable, sha256 } from '@/lib/muse/connector'
import { isMuseUuid, musePublicOrigin } from '@/lib/muse/links'
import { museCallback, parseMuseAuthorization } from '@/lib/muse/oauth-params'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: Request) {
  const origin = musePublicOrigin(request)
  if (request.headers.get('origin') !== origin) return museJson({ error: 'My-SNS の承認画面から接続してください。' }, 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return museJson({ error: '接続リクエストの形式が正しくありません。' }, 415)
  }

  try {
    const body = await readJsonBodyWithLimit(request, 8192)
    if (!body.ok) return museJson({ error: body.message }, body.status)
    const input = body.value as { authorization?: unknown; workspaceId?: unknown; canCapture?: unknown } | null
    if (typeof input?.authorization !== 'string' || !isMuseUuid(input.workspaceId) || typeof input.canCapture !== 'boolean') {
      return museJson({ error: 'ワークスペースと許可する操作を確認してください。' }, 400)
    }
    const authorization = parseMuseAuthorization(new URLSearchParams(input.authorization), origin)
    if (!authorization || (input.canCapture && !authorization.canCapture)) {
      return museJson({ error: 'Muse から接続をやり直してください。' }, 400)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return museJson({ error: 'ログインしてください。' }, 401)
    const access = await requireWorkspaceMember(
      supabase, input.workspaceId, user.id, 'edit_settings', '接続を承認できるのはオーナーと管理者です。',
    )
    if (access instanceof NextResponse) return access

    const code = randomBytes(32).toString('base64url')
    const { data, error } = await createServiceClient().rpc('approve_muse_oauth', {
      p_workspace_id: input.workspaceId,
      p_user_id: user.id,
      p_code_hash: sha256(code),
      p_code_challenge: authorization.challenge,
      p_redirect_uri: authorization.redirectUri,
      p_can_capture: input.canCapture,
    })
    if (error) return museUnavailable()
    if (data !== true) return museJson({ error: 'このワークスペースの接続を承認できませんでした。' }, 403)

    return museJson({ redirectTo: museCallback(authorization, { code }) })
  } catch {
    return museUnavailable()
  }
}
