import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'
import type { CalendarSyncProvider } from '@/lib/services/connectors/calendar-sync-types'
import {
  CALENDAR_SYNC_PROVIDERS,
  configuredCalendarSyncProviders,
  syncEventToProviders,
  type ProviderSyncOutcome,
} from '@/lib/services/calendar-sync'

// Pushes one calendar event to every configured external provider (Notion /
// TimeTree). A durable DB claim is acquired BEFORE any external create call so
// double-clicks, HTTP retries, and overlapping requests cannot create duplicate
// provider events. A pending/unknown result is intentionally never auto-retried.

interface SyncBody {
  workspaceId?: string
  eventId?: string
}

interface CalendarSyncLinkRow {
  status: 'pending' | 'synced' | 'failed'
  external_id: string | null
  external_url: string | null
  last_error: string | null
}

function orderOutcomes(outcomes: ProviderSyncOutcome[]): ProviderSyncOutcome[] {
  const order = new Map(CALENDAR_SYNC_PROVIDERS.map((provider, index) => [provider, index]))
  return outcomes.slice().sort((left, right) => (order.get(left.provider) ?? 99) - (order.get(right.provider) ?? 99))
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

  const calendarEvent = {
    title: event.title,
    description: event.description ?? undefined,
    startsAt: event.starts_at,
    endsAt: event.ends_at ?? undefined,
    allDay: event.all_day,
    location: event.location ?? undefined,
  }

  const configured = new Set(configuredCalendarSyncProviders())
  const claimedProviders: CalendarSyncProvider[] = []
  const outcomes: ProviderSyncOutcome[] = []

  for (const provider of CALENDAR_SYNC_PROVIDERS) {
    if (!configured.has(provider)) {
      outcomes.push({ provider, status: 'unavailable' })
      continue
    }

    const { data: claimed, error: claimError } = await supabase.rpc('claim_calendar_sync', {
      p_workspace_id: workspaceId,
      p_calendar_event_id: eventId,
      p_provider: provider,
    })

    if (claimError) {
      outcomes.push({ provider, status: 'failed', error: `同期開始を記録できませんでした: ${claimError.message}` })
      continue
    }

    if (claimed === true) {
      claimedProviders.push(provider)
      continue
    }

    const { data: existing, error: existingError } = await supabase
      .from('calendar_sync_links')
      .select('status, external_id, external_url, last_error')
      .eq('workspace_id', workspaceId)
      .eq('calendar_event_id', eventId)
      .eq('provider', provider)
      .maybeSingle()

    if (existingError || !existing) {
      outcomes.push({ provider, status: 'failed', error: '既存の同期状態を確認できませんでした。安全のため再作成していません。' })
      continue
    }

    const link = existing as CalendarSyncLinkRow
    if (link.status === 'synced') {
      outcomes.push({
        provider,
        status: 'synced',
        externalId: link.external_id ?? undefined,
        externalUrl: link.external_url ?? undefined,
      })
    } else if (link.status === 'pending') {
      outcomes.push({
        provider,
        status: 'failed',
        error: '前回の外部同期結果が未確定です。重複作成を防ぐため、新しい同期は開始していません。',
      })
    } else {
      outcomes.push({ provider, status: 'failed', error: link.last_error ?? '前回の同期に失敗しました。' })
    }
  }

  if (claimedProviders.length > 0) {
    const freshOutcomes = await syncEventToProviders(calendarEvent, claimedProviders)

    for (const outcome of freshOutcomes) {
      const finalStatus = outcome.status === 'synced' ? 'synced' : 'failed'
      const { error: finishError } = await supabase.rpc('finish_calendar_sync', {
        p_workspace_id: workspaceId,
        p_calendar_event_id: eventId,
        p_provider: outcome.provider,
        p_status: finalStatus,
        p_external_id: outcome.externalId ?? null,
        p_external_url: outcome.externalUrl ?? null,
        p_error: outcome.status === 'synced' ? null : (outcome.error ?? `${outcome.provider}同期に失敗しました。`),
      })

      if (finishError) {
        // If the provider create succeeded but this bookkeeping write failed,
        // the claim remains pending. Future requests will refuse to create
        // another external event, avoiding the original duplicate-sync bug.
        outcomes.push({
          provider: outcome.provider,
          status: 'failed',
          error: outcome.status === 'synced'
            ? '外部カレンダーへの作成後に同期記録を確定できませんでした。重複防止のため再同期は停止されています。外部カレンダーを確認してください。'
            : `${outcome.error ?? '外部同期に失敗しました。'} 同期状態の保存にも失敗したため、自動再試行は停止されています。`,
        })
        continue
      }

      outcomes.push(outcome)
    }
  }

  return NextResponse.json({ outcomes: orderOutcomes(outcomes) })
}
