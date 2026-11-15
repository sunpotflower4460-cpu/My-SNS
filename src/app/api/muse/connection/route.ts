import { NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-access'
import { readJsonBodyWithLimit } from '@/lib/api/read-json'
import { createMuseKey, museJson, museUnavailable } from '@/lib/muse/connector'
import { isMuseUuid } from '@/lib/muse/links'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function authorize(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspaceId')
  if (!isMuseUuid(workspaceId)) return museJson({ error: 'ワークスペースを確認してください。' }, 400)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return museJson({ error: 'ログインしてください。' }, 401)

  const access = await requireWorkspaceMember(
    supabase, workspaceId, user.id, 'edit_settings', '接続キーを管理できるのはオーナーと管理者です。',
  )
  if (access instanceof NextResponse) return museJson(await access.json(), access.status)
  return { workspaceId, userId: user.id, service: createServiceClient() }
}

export async function GET(request: Request) {
  try {
    const access = await authorize(request)
    if (access instanceof NextResponse) return access

    const { data, error } = await access.service.from('muse_connector_keys')
      .select('expires_at, can_capture').eq('workspace_id', access.workspaceId).maybeSingle()
    if (error) return museUnavailable()
    const credential = data ? { expiresAt: data.expires_at, canCapture: data.can_capture } : null
    return museJson({ credential })
  } catch {
    return museUnavailable()
  }
}

export async function POST(request: Request) {
  try {
    const access = await authorize(request)
    if (access instanceof NextResponse) return access
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return museJson({ error: '接続キーの権限を指定してください。' }, 415)
    }
    const body = await readJsonBodyWithLimit(request, 1024)
    if (!body.ok) return museJson({ error: body.message }, body.status)
    const canCapture = (body.value as { canCapture?: unknown } | null)?.canCapture
    if (typeof canCapture !== 'boolean') return museJson({ error: '接続キーの権限を指定してください。' }, 400)

    const { key, hash, expiresAt } = createMuseKey()
    const { error } = await access.service.from('muse_connector_keys').upsert({
      workspace_id: access.workspaceId,
      issued_by: access.userId,
      token_hash: hash,
      expires_at: expiresAt,
      can_capture: canCapture,
    }, { onConflict: 'workspace_id' })
    if (error) return museUnavailable()
    // Only the issuer sees the raw key, once, in this non-cacheable response.
    return museJson({ key, credential: { expiresAt, canCapture } }, 201)
  } catch {
    return museUnavailable()
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await authorize(request)
    if (access instanceof NextResponse) return access
    const { error } = await access.service.from('muse_connector_keys').delete().eq('workspace_id', access.workspaceId)
    return error ? museUnavailable() : museJson({ credential: null })
  } catch {
    return museUnavailable()
  }
}
