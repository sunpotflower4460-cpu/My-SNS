import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { consumeOAuthState } from '@/lib/repositories/supabase/oauth-states'
import {
  deletePendingSocialAccount,
  finalizeSocialAccountConnection,
  getSocialAccountById,
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
    // Provider error strings are external input and can contain implementation
    // details. Keep the raw value in server logs, but never reflect it into the
    // Settings URL/browser history.
    console.error(`${platform} OAuth provider rejected the connection:`, providerError)
    settingsUrl.searchParams.set('error', 'SNS側で接続が完了しませんでした。もう一度接続をお試しください。')
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
      finalize: async () => finalizeSocialAccountConnection(supabase, account.id),
      verifyFinalized: async () => {
        // Verification is deliberately service-role: if membership/RLS changes
        // immediately after the RPC committed, a session-scoped read could look
        // like "row missing" and cause us to delete credentials from a live
        // connection. We are checking one account id created by this request.
        const current = await getSocialAccountById(serviceClient, account.id)
        return current?.connected ? current : null
      },
      cleanup: async () => { await deleteSocialCredentials(serviceClient, account.id) },
      onVerificationError: (verificationCause) => {
        console.error(`Could not verify whether ${platform} connection finalization committed:`, verificationCause)
      },
      onCleanupError: (cleanupCause) => {
        console.error(`Failed to clean credentials after ${platform} connection finalization failed:`, cleanupCause)
      },
    })

    // From here the row is durably connected (either the RPC response was
    // received, or the reconciliation read confirmed a lost-response commit).
    pendingAccountId = null

    const { error: auditError } = await supabase.from('audit_logs').insert({
      workspace_id: consumed.workspaceId,
      actor_id: user.id,
      action: 'social_account_connected',
      target_type: 'social_account',
      target_id: account.id,
      metadata: { platform, handle: connected.handle },
    })
    if (auditError) {
      // Connection is already authoritative. Audit failure is observability,
      // not a reason to roll back or report a false connection failure.
      console.error(`Failed to audit ${platform} social account connection:`, auditError)
    }

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

    // Do not reflect raw provider/Supabase error text into a URL query string.
    // That can leak implementation details into browser history or screenshots.
    console.error(`Failed to complete ${platform} social account connection:`, cause)
    settingsUrl.searchParams.set('error', 'SNSアカウントの接続を完了できませんでした。設定を確認して、もう一度お試しください。')
    return NextResponse.redirect(settingsUrl)
  }
}
