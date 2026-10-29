import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { appendAuditLogWithClient } from '@/lib/repositories/supabase/audit'
import {
  getSocialAccountIdentity,
  insertShadowStrategy,
  listShadowStrategies,
  ShadowStrategyConflictError,
  shadowStrategyAuditMetadata,
} from '@/lib/repositories/supabase/shadow-strategies'
import { parseShadowStrategyImportPayload } from '@/lib/shadow-strategy/parse-import'
import {
  assertRequestMatchesLink,
  assertSocialAccountMatchesImport,
  projectShadowGrowthStrategy,
} from '@/lib/shadow-strategy/projection'
import { readJsonBodyWithLimit } from '@/lib/shadow-strategy/request-body'
import { SHADOW_STRATEGY_HISTORY_LIMIT } from '@/lib/shadow-strategy/constants'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId')?.trim() ?? ''
  const socialAccountId = request.nextUrl.searchParams.get('socialAccountId')?.trim() ?? ''
  if (!workspaceId || !socialAccountId) {
    return NextResponse.json({ error: 'workspaceIdとsocialAccountIdは必須です。' }, { status: 400 })
  }
  if (!isUuid(workspaceId) || !isUuid(socialAccountId)) {
    return NextResponse.json({ error: 'workspaceIdとsocialAccountIdの形式が正しくありません。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })

  const membership = await requireWorkspaceMember(
    supabase,
    workspaceId,
    user.id,
    'view_shadow_strategy',
    'このワークスペースで Shadow Strategy を閲覧する権限がありません。',
  )
  if (isNextResponse(membership)) return membership

  let serviceClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Shadow strategy service client is unavailable:', cause)
    return NextResponse.json(
      { error: 'サーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  let history
  try {
    history = await listShadowStrategies(serviceClient, workspaceId, socialAccountId, SHADOW_STRATEGY_HISTORY_LIMIT)
  } catch (cause) {
    console.error('Failed to list shadow strategies:', cause)
    return NextResponse.json(
      { error: 'Shadow Strategy を読み込めなかったため、安全のため処理を中止しました。少し待ってから再試行してください。' },
      { status: 503 },
    )
  }

  return NextResponse.json({
    latest: history[0] ?? null,
    history,
  })
}

export async function POST(request: NextRequest) {
  const body = await readJsonBodyWithLimit(request)
  if (!body.ok) {
    return NextResponse.json({ error: body.message }, { status: body.status })
  }
  if (typeof body.value !== 'object' || body.value === null || Array.isArray(body.value)) {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const record = body.value as Record<string, unknown>
  const workspaceId = typeof record.workspaceId === 'string' ? record.workspaceId.trim() : ''
  const socialAccountId = typeof record.socialAccountId === 'string' ? record.socialAccountId.trim() : ''
  if (!workspaceId || !socialAccountId) {
    return NextResponse.json({ error: 'workspaceIdとsocialAccountIdは必須です。' }, { status: 400 })
  }
  if (!isUuid(workspaceId) || !isUuid(socialAccountId)) {
    return NextResponse.json({ error: 'workspaceIdとsocialAccountIdの形式が正しくありません。' }, { status: 400 })
  }
  if (!('payload' in record)) {
    return NextResponse.json({ error: 'payload は { link, strategy } である必要があります。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })

  const membership = await requireWorkspaceMember(
    supabase,
    workspaceId,
    user.id,
    'manage_shadow_strategy',
    'このワークスペースで Shadow Strategy を取り込む権限がありません。',
  )
  if (isNextResponse(membership)) return membership

  let serviceClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Shadow strategy service client is unavailable:', cause)
    return NextResponse.json(
      { error: 'サーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  let account
  try {
    account = await getSocialAccountIdentity(serviceClient, workspaceId, socialAccountId)
  } catch (cause) {
    console.error('Failed to load social account for shadow strategy import:', cause)
    return NextResponse.json(
      { error: 'SNSアカウントを確認できないため、安全のため処理を中止しました。少し待ってから再試行してください。' },
      { status: 503 },
    )
  }
  if (!account) {
    return NextResponse.json({ error: 'SNSアカウントが見つかりません。' }, { status: 404 })
  }

  const parsed = parseShadowStrategyImportPayload(record.payload)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message, code: parsed.code }, { status: 400 })
  }

  const requestMatch = assertRequestMatchesLink({
    workspaceId,
    socialAccountId,
    link: parsed.value.link,
  })
  if (!requestMatch.ok) {
    return NextResponse.json({ error: requestMatch.message, code: requestMatch.code }, { status: 400 })
  }

  const accountMatch = assertSocialAccountMatchesImport({
    account,
    workspaceId,
    socialAccountId,
    link: parsed.value.link,
    strategy: parsed.value.strategy,
  })
  if (!accountMatch.ok) {
    return NextResponse.json({ error: accountMatch.message, code: accountMatch.code }, { status: 400 })
  }

  const importedAt = new Date().toISOString()
  const projected = projectShadowGrowthStrategy({ payload: parsed.value, importedAt })

  try {
    const result = await insertShadowStrategy(serviceClient, projected, user.id)
    if (result.created) {
      await appendAuditLogWithClient(serviceClient, {
        workspaceId,
        actorId: user.id,
        action: 'shadow_strategy_imported',
        targetType: 'shadow_growth_strategy',
        targetId: socialAccountId,
        metadata: shadowStrategyAuditMetadata(result.strategy),
      })
    }
    return NextResponse.json({ strategy: result.strategy, created: result.created }, { status: result.created ? 201 : 200 })
  } catch (cause) {
    if (cause instanceof ShadowStrategyConflictError) {
      return NextResponse.json({ error: cause.message }, { status: 409 })
    }
    console.error('Failed to insert shadow strategy:', cause)
    return NextResponse.json(
      { error: 'Shadow Strategy を保存できないため、安全のため処理を中止しました。少し待ってから再試行してください。' },
      { status: 503 },
    )
  }
}
