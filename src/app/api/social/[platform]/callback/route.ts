import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { consumeOAuthState } from '@/lib/repositories/supabase/oauth-states'
import {
  deletePendingSocialAccount,
  finalizeSocialAccountConnection,
  upsertPendingSocialAccount,
} from '@/lib/repositories/supabase/social-accounts'
import { deleteSocialCredentials, saveSocialCredentials } from '@/lib/repositories/supabase/social-credentials'
import { getConnectorAdapter, isConnectablePlatform } from '@/lib/services/connectors'
import { finalizeSocialConnectionWithCleanup } from '@/lib/services/social-connection-finalization'

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
    settingsUrl.searchParams.set('error', 'OAuthコールバックのパラメーターが不正です。')
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

  const consumed = await consumeOAuthState(supabase, state)
  if (!consumed || consumed.platform !== platform) {
    settingsUrl.searchParams.set('error', 'この接続試行は期限切れか、すでに使用されています。もう一度お試しください。')
    return NextResponse.redirect(settingsUrl)
  }

  let pendingAccountId: string | null = null

  try {
    const adapter = getConnectorAdapter(platform)
    const connected = await adapter.connect(platform, code, {
      redirectUri: redirectUriFor(request, platform),
      codeVerifier: consumed.codeVerifier,
    })

    // Every OAuth attempt gets a fresh disconnected staging row. The currently
    // working account remains live until the new encrypted credential is saved
    // and finalizeSocialAccountConnection atomically swaps active accounts.
    const account = await upsertPendingSocialAccount(supabase, {
      workspaceId: consumed.workspaceId,
      platform,
      handle: connected.handle,
      externalAccountId: connected.externalAccountId,
    })
    pendingAccountId = account.id

    const serviceClient = createServiceClient()
    await saveSocialCredentials(serviceClient, account.id, {
      accessToken: connected.accessToken,
      refreshToken: connected.refreshToken,
      expiresAt: connected.expiresAt,
      scopes: connected.scopes,
    })

    await finalizeSocialConnectionWithCleanup({
      finalize: async () => { await finalizeSocialAccountConnection(supabase, account.id) },
      cleanup: async () => { await deleteSocialCredentials(serviceClient, account.id) },
      onCleanupError: (cleanupCause) => {
        console.error(`Failed to clean credentials after ${platform} connection finalization failed:`, cleanupCause)
      },
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
    // A failed OAuth attempt must not leave disconnected staging rows forever.
    // The delete is constrained to connected=false, so if finalization actually
    // committed but its HTTP response was lost, this cleanup cannot delete the
    // now-live account. Credential rows cascade with a genuinely pending row.
    if (pendingAccountId) {
      await deletePendingSocialAccount(supabase, pendingAccountId).catch((cleanupCause) => {
        console.error(`Failed to remove pending ${platform} account after OAuth failure:`, cleanupCause)
      })
    }

    const message = cause instanceof Error ? cause.message : '接続を完了できませんでした。'
    settingsUrl.searchParams.set('error', message)
    return NextResponse.redirect(settingsUrl)
  }
}
