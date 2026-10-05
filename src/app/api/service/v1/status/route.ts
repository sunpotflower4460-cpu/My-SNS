import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { handleArtistOsStatus, type StatusLoader } from '@/lib/service/artist-os-handler'
import { STATUS_ROW_LIMIT } from '@/lib/service/artist-os-status'

// Read-only projection for Artist OS. Authenticated with ARTIST_OS_SERVICE_TOKEN
// (NOT CRON_SECRET: that token triggers publishing). The service-role client
// bypasses RLS, so every query is pinned to the single workspace named by
// ARTIST_OS_WORKSPACE_ID and selects an explicit column allowlist. It never
// touches social_account_credentials or oauth_states.
export const dynamic = 'force-dynamic'

const loadStatus: StatusLoader = async (workspaceId) => {
  const supabase = createServiceClient()
  const [drafts, jobs, replies, inbox] = await Promise.all([
    supabase
      .from('social_drafts')
      .select('id, channel, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(STATUS_ROW_LIMIT),
    supabase
      .from('publish_jobs')
      .select('id, channel, status, scheduled_at, published_at, created_at')
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'failed', 'published'])
      .order('created_at', { ascending: false })
      .limit(STATUS_ROW_LIMIT),
    supabase
      .from('reply_jobs')
      .select('id, platform, status, scheduled_at')
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'failed'])
      .order('scheduled_at', { ascending: false })
      .limit(STATUS_ROW_LIMIT),
    supabase
      .from('inbox_items')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('needs_action', true),
  ])
  for (const r of [drafts, jobs, replies, inbox]) if (r.error) throw new Error('query failed')
  return {
    draftsAwaitingApproval: drafts.data ?? [],
    publishJobs: (jobs.data ?? []) as never,
    replyJobs: (replies.data ?? []) as never,
    inboxNeedsAction: inbox.count ?? 0,
  }
}

export async function GET(request: NextRequest) {
  const result = await handleArtistOsStatus(
    request.headers.get('authorization'),
    {
      token: process.env.ARTIST_OS_SERVICE_TOKEN,
      workspaceId: process.env.ARTIST_OS_WORKSPACE_ID,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    },
    loadStatus,
  )
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
}
