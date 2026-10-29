import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOAuthState } from '@/lib/repositories/supabase/oauth-states'
import { buildAuthorizeUrl, isConnectablePlatform, type ConnectablePlatform } from '@/lib/services/connectors'
import { buildPlatformRedirectUri } from '@/lib/services/connectors/platform-setup'
import { getPlatformSetupStatus } from '@/lib/services/connectors/platform-status'
import { isTokenEncryptionConfigured } from '@/lib/crypto/token-cipher'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { generateState } from '@/lib/services/connectors/pkce'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

function redirectUriFor(request: NextRequest, platform: ConnectablePlatform): string {
  return buildPlatformRedirectUri(process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin, platform)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const workspaceId = request.nextUrl.searchParams.get('workspaceId')
  const settingsUrl = new URL('/app/settings', process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin)

  if (!workspaceId) {
    settingsUrl.searchParams.set('error', 'アカウントを接続するにはワークスペースが必要です。')
    return NextResponse.redirect(settingsUrl)
  }
  if (!isConnectablePlatform(platform)) {
    settingsUrl.searchParams.set('error', `${platform}はまだ接続できません。`)
    return NextResponse.redirect(settingsUrl)
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    settingsUrl.searchParams.set('error', '先にログインしてください。')
    return NextResponse.redirect(settingsUrl)
  }

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError) {
    settingsUrl.searchParams.set('error', 'メンバーシップを確認できないため、安全のため接続を中止しました。少し待ってから再試行してください。')
    return NextResponse.redirect(settingsUrl)
  }

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'manage_social_accounts')) {
    settingsUrl.searchParams.set('error', 'あなたの役割ではSNSアカウントを接続できません。')
    return NextResponse.redirect(settingsUrl)
  }

  // Setup checks come after auth + role so missing env var names are only
  // ever shown to a signed-in member who is allowed to connect accounts.
  const label = PUBLISHING_CHANNEL_CONFIG[platform].label
  const setup = getPlatformSetupStatus(platform)
  if (!setup.configured) {
    settingsUrl.searchParams.set(
      'error',
      `${label}の開発者アプリがまだ設定されていません（不足: ${setup.missingEnv.join(', ')}）。設定画面のセットアップ手順を確認してください。`,
    )
    return NextResponse.redirect(settingsUrl)
  }
  // Without this key the OAuth round-trip would succeed on the platform side
  // and then fail to store the token — refuse up front instead.
  if (!isTokenEncryptionConfigured()) {
    settingsUrl.searchParams.set(
      'error',
      'トークン暗号化キー（SOCIAL_TOKEN_ENCRYPTION_KEY）が未設定か不正なため、接続を開始できません。',
    )
    return NextResponse.redirect(settingsUrl)
  }

  const redirectUri = redirectUriFor(request, platform)
  const state = generateState()
  const { url, codeVerifier } = buildAuthorizeUrl(platform, state, redirectUri)

  try {
    await createOAuthState(supabase, {
      workspaceId,
      platform,
      state,
      codeVerifier,
      createdBy: user.id,
    })
  } catch (cause) {
    settingsUrl.searchParams.set('error', cause instanceof Error ? cause.message : '接続を開始できませんでした。')
    return NextResponse.redirect(settingsUrl)
  }

  return NextResponse.redirect(url)
}
