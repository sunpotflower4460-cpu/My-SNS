import type { CalendarEvent } from '@/lib/domain/types'
import type { ProviderSyncOutcome } from '@/lib/services/calendar-sync'
import type { CalendarSyncProvider } from '@/lib/services/connectors/calendar-sync-types'

// Pure presenter for the 予定 (calendar) page (UI-PR4). Day-grouping with a
// friendly relative label (今日 / 明日 / それ以降), and the sync-outcome messaging.
// No React, no side effects, no schema/route change — just how existing events
// and sync results are arranged and worded, so both are unit-testable and the
// JST boundary is explicit.

const JST = 'Asia/Tokyo'

/** The JST calendar day (YYYY-MM-DD) an instant belongs to. */
export function jstDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: JST })
}

function jstDayKeyOfNow(now: number): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: JST })
}

export interface CalendarDayGroup {
  /** JST day key, YYYY-MM-DD. */
  day: string
  /** '今日' / '明日' when applicable, else null (the page renders the full date). */
  relativeLabel: string | null
  events: CalendarEvent[]
}

/** The JST day key N days after the given day key. Pure string date math via UTC noon (DST-free for JST). */
function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const base = Date.UTC(y, m - 1, d, 12) // noon UTC avoids any TZ/DST edge
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Group today-and-future events (JST) by day, soonest first, events within a day
 * ordered by start time. Past days are dropped to keep the upcoming view calm.
 * `relativeLabel` marks 今日 / 明日 so the heading reads naturally.
 */
export function buildUpcomingAgenda(events: CalendarEvent[], now: number): CalendarDayGroup[] {
  const todayKey = jstDayKeyOfNow(now)
  const tomorrowKey = addDays(todayKey, 1)

  const byDay = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = jstDayKey(event.startsAt)
    if (key < todayKey) continue
    byDay.set(key, [...(byDay.get(key) ?? []), event])
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayEvents]) => ({
      day,
      relativeLabel: day === todayKey ? '今日' : day === tomorrowKey ? '明日' : null,
      events: dayEvents
        .slice()
        .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
    }))
}

// ─── Sync outcome messaging ─────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<CalendarSyncProvider, string> = { notion: 'Notion', timetree: 'TimeTree' }

export function providerLabel(provider: CalendarSyncProvider): string {
  return PROVIDER_LABELS[provider] ?? provider
}

export interface SyncMessage {
  feedback?: string
  error?: string
}

/**
 * Turn per-provider sync outcomes into user-facing messages. Honest about
 * partial results: reports what DID sync even alongside a failure (so a retry
 * doesn't re-push an already-synced provider), and when nothing is configured
 * says so with a fail-closed hint instead of a false success. Mirrors the
 * contract in calendar-sync.ts (unavailable = not set up, never faked).
 */
export function summarizeSyncOutcomes(outcomes: ProviderSyncOutcome[]): SyncMessage {
  const synced = outcomes.filter((o) => o.status === 'synced').map((o) => providerLabel(o.provider))
  const failed = outcomes.filter((o) => o.status === 'failed').map((o) => providerLabel(o.provider))
  const anyAvailable = outcomes.some((o) => o.status !== 'unavailable')

  if (!anyAvailable) {
    return { error: '外部カレンダー連携（Notion / TimeTree）が未設定です。設定でトークンを設定すると同期できます。' }
  }

  const message: SyncMessage = {}
  if (synced.length > 0) message.feedback = `${synced.join('、')}に同期しました。`
  if (failed.length > 0) message.error = `同期に失敗しました: ${failed.join('、')}。`
  return message
}
