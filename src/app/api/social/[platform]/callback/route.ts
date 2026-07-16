import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { consumeOAuthState } from '@/lib/repositories/supabase/oauth-states'
import { upsertConnectedSocialAccount } from '@/lib/repositories/supabase/social-accounts'
import { saveSocialCredentials } from '@/lib/repositories/supabase/social-credentials'
import { getConnectorAdapter, isConnectablePlatform } from '@/lib/services/connectors'

function redirectUriFor(request: NextRequest, platform: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin
  return `${base}/api/social/${platform}/callback`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const settingsUrl = new URL('/app/settings', process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin)

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const providerError = request.nextUrl.searchParams.get('error_description') ?? request.nextUrl.searchParams.get('error')

  if (providerError) {
    settingsUrl.searchParams.set('error', providerError)
    return NextResponse.redirect(settingsUrl)
  }
  if (!isConnectablePlatform(platform) || !code || !state) {
    settingsUrl.searchParams.set('error', 'Missing or invalid OAuth callback parameters.')
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

  const consumed = await consumeOAuthState(supabase, state)
  if (!consumed || consumed.platform !== platform) {
    settingsUrl.searchParams.set('error', 'This connection attempt expired or was already used. Please try again.')
    return NextResponse.redirect(settingsUrl)
  }

  try {
    const adapter = getConnectorAdapter(platform)
    const connected = await adapter.connect(platform, code, {
      redirectUri: redirectUriFor(request, platform),
      codeVerifier: consumed.codeVerifier,
    })

    const account = await upsertConnectedSocialAccount(supabase, {
      workspaceId: consumed.workspaceId,
      platform,
      handle: connected.handle,
      externalAccountId: connected.externalAccountId,
    })

    const serviceClient = createServiceClient()
    await saveSocialCredentials(serviceClient, account.id, {
      accessToken: connected.accessToken,
      refreshToken: connected.refreshToken,
      expiresAt: connected.expiresAt,
      scopes: connected.scopes,
    })

    await supabase.from('audit_logs').insert({
      workspace_id: consumed.workspaceId,
      actor_id: user.id,
      action: 'social_account_connected',
      target_type: 'social_account',
      target_id: account.id,
      metadata: { platform, handle: connected.handle },
    })

    settingsUrl.searchParams.set('connected', platform)
    return NextResponse.redirect(settingsUrl)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to complete the connection.'
    settingsUrl.searchParams.set('error', message)
    return NextResponse.redirect(settingsUrl)
  }
}
