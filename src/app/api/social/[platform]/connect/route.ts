import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOAuthState } from '@/lib/repositories/supabase/oauth-states'
import { buildAuthorizeUrl, isConnectablePlatform, isPlatformConfigured } from '@/lib/services/connectors'
import { generateState } from '@/lib/services/connectors/pkce'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

function redirectUriFor(request: NextRequest, platform: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin
  return `${base}/api/social/${platform}/callback`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const workspaceId = request.nextUrl.searchParams.get('workspaceId')
  const settingsUrl = new URL('/app/settings', process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin)

  if (!workspaceId) {
    settingsUrl.searchParams.set('error', 'A workspace is required to connect an account.')
    return NextResponse.redirect(settingsUrl)
  }
  if (!isConnectablePlatform(platform)) {
    settingsUrl.searchParams.set('error', `${platform} cannot be connected yet.`)
    return NextResponse.redirect(settingsUrl)
  }
  if (!isPlatformConfigured(platform)) {
    settingsUrl.searchParams.set('error', `${platform} is not configured on this deployment yet.`)
    return NextResponse.redirect(settingsUrl)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    settingsUrl.searchParams.set('error', 'Please sign in first.')
    return NextResponse.redirect(settingsUrl)
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'manage_social_accounts')) {
    settingsUrl.searchParams.set('error', 'Your role cannot connect social accounts.')
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
    settingsUrl.searchParams.set('error', cause instanceof Error ? cause.message : 'Unable to start the connection.')
    return NextResponse.redirect(settingsUrl)
  }

  return NextResponse.redirect(url)
}
