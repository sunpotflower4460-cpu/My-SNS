import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'
import { syncEventToProviders } from '@/lib/services/calendar-sync'

// Pushes one calendar event to every configured external provider (Notion /
// TimeTree). Server-only because it uses provider secret tokens from env. Fail-
// closed: an unconfigured provider comes back status:'unavailable' — never a
// fake success. Real sync only happens once the human sets the provider tokens.

interface SyncBody {
  workspaceId?: string
  eventId?: string
}

export async function POST(request: NextRequest) {
  let body: SyncBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, eventId } = body
  if (!workspaceId || !eventId) {
    return NextResponse.json({ error: 'workspaceIdとeventIdは必須です。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'manage_calendar')) {
    return NextResponse.json({ error: 'このワークスペースでカレンダーを編集する権限がありません。' }, { status: 403 })
  }

  // RLS-scoped to the caller's workspace.
  const { data: event, error: eventError } = await supabase
    .from('calendar_events')
    .select('title, description, starts_at, ends_at, all_day, location')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (eventError || !event) {
    return NextResponse.json({ error: '予定が見つかりません。' }, { status: 404 })
  }

  const outcomes = await syncEventToProviders({
    title: event.title,
    description: event.description ?? undefined,
    startsAt: event.starts_at,
    endsAt: event.ends_at ?? undefined,
    allDay: event.all_day,
    location: event.location ?? undefined,
  })

  return NextResponse.json({ outcomes })
}
