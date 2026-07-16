import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveCredentials } from '@/lib/services/publish-worker'
import { getConnectorAdapter } from '@/lib/services/connectors'
import { upsertInboxItems } from '@/lib/repositories/supabase/inbox-ingest'
import { hasPermission } from '@/lib/permissions'
import type { SocialPlatform, WorkspaceRole } from '@/lib/domain/types'

// Manual, on-demand pull sync — the counterpart to /api/webhooks/meta's push
// ingestion. Exists because most platforms (X, TikTok, and Instagram's own
// "mentions" field) have no webhook this app can receive, and YouTube has no
// webhook at all for comments — see each connector's fetchInbox for which
// platforms actually return anything here versus fail closed with an honest
// "not available" reason.

interface SyncRequestBody {
  workspaceId?: string
  platform?: SocialPlatform
}

export async function POST(request: NextRequest) {
  let body: SyncRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { workspaceId, platform } = body
  if (!workspaceId || !platform) {
    return NextResponse.json({ error: 'workspaceId and platform are required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'manage_social_accounts')) {
    return NextResponse.json({ error: 'Not permitted to sync inbox items in this workspace.' }, { status: 403 })
  }

  const serviceClient = createServiceClient()

  let credentials
  try {
    credentials = await resolveCredentials(serviceClient, workspaceId, platform)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Unable to resolve credentials.' }, { status: 502 })
  }
  if (!credentials) {
    return NextResponse.json({ error: `No connected ${platform} account for this workspace.` }, { status: 400 })
  }

  try {
    const events = await getConnectorAdapter(platform).fetchInbox({
      platform,
      accessToken: credentials.accessToken,
      externalAccountId: credentials.externalAccountId,
      handle: credentials.handle,
    })
    const ingested = await upsertInboxItems(serviceClient, workspaceId, events)
    return NextResponse.json({ ingested })
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Sync failed.' }, { status: 502 })
  }
}
