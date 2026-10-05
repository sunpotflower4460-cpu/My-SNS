import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { handleArtistOsInbound, type InboundLoader } from '@/lib/service/artist-os-handler'
import { INBOUND_ROW_LIMIT } from '@/lib/service/artist-os-inbound'

// Read-only canonical inbound events for Artist OS / relationship intelligence. Same auth and
// workspace pinning as /api/service/v1/status. No tokens or raw provider payloads; DM text is never returned.
export const dynamic = 'force-dynamic'

const loadInbound: InboundLoader = async (workspaceId) => {
  const supabase = createServiceClient()
  const items = await supabase
    .from('inbox_items')
    .select('id, platform, kind, external_id, author_handle, text, received_at, needs_action, contact_id, seed_id')
    .eq('workspace_id', workspaceId)
    .order('received_at', { ascending: false })
    .limit(INBOUND_ROW_LIMIT)
  if (items.error) throw new Error('query failed')
  const rows = (items.data ?? []) as Array<Record<string, unknown>>

  const contactIds = Array.from(new Set(rows.map((r) => r.contact_id).filter((v): v is string => typeof v === 'string')))
  const contacts = contactIds.length
    ? await supabase.from('messaging_contacts').select('id, external_contact_id').eq('workspace_id', workspaceId).in('id', contactIds)
    : { data: [], error: null }
  if (contacts.error) throw new Error('query failed')
  const contactById = new Map((contacts.data ?? []).map((c: { id: string; external_contact_id: string }) => [c.id, c.external_contact_id]))

  const itemIds = rows.map((r) => r.id as string)
  const jobs = itemIds.length
    ? await supabase.from('reply_jobs').select('inbox_item_id, status').eq('workspace_id', workspaceId).in('inbox_item_id', itemIds)
    : { data: [], error: null }
  if (jobs.error) throw new Error('query failed')

  return {
    rows: rows.map((r) => ({
      id: r.id as string,
      platform: r.platform as string,
      kind: r.kind as string,
      external_id: (r.external_id as string | null) ?? null,
      author_handle: (r.author_handle as string | null) ?? null,
      text: (r.text as string | null) ?? null,
      received_at: r.received_at as string,
      needs_action: Boolean(r.needs_action),
      seed_id: typeof r.seed_id === 'string' ? r.seed_id : null,
      contact_external_id: typeof r.contact_id === 'string' ? (contactById.get(r.contact_id) ?? null) : null,
    })),
    replyJobs: (jobs.data ?? []) as never,
  }
}

export async function GET(request: NextRequest) {
  const result = await handleArtistOsInbound(
    request.headers.get('authorization'),
    { token: process.env.ARTIST_OS_SERVICE_TOKEN, inboundReadToken: process.env.ARTIST_OS_INBOUND_READ_TOKEN, workspaceId: process.env.ARTIST_OS_WORKSPACE_ID },
    loadInbound,
  )
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
}
