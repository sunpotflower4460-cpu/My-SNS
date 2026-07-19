import type { CalendarSyncConnector, CalendarSyncEvent, CalendarSyncResult } from './calendar-sync-types'

// TimeTree calendar sync. Uses an access token (issued for a TimeTree
// application at https://developers.timetree.app/) and the target calendar id.
// Server-only. Both env vars must be set or every call fails closed.
// https://developers.timetree.app/en/docs/api/events

const TIMETREE_API_BASE = 'https://timetreeapis.com'

export function isTimeTreeCalendarConfigured(): boolean {
  return Boolean(process.env.TIMETREE_ACCESS_TOKEN?.trim() && process.env.TIMETREE_CALENDAR_ID?.trim())
}

export class TimeTreeCalendarConnector implements CalendarSyncConnector {
  readonly provider = 'timetree' as const

  isConfigured(): boolean {
    return isTimeTreeCalendarConfigured()
  }

  async syncEvent(event: CalendarSyncEvent): Promise<CalendarSyncResult> {
    const token = process.env.TIMETREE_ACCESS_TOKEN?.trim()
    const calendarId = process.env.TIMETREE_CALENDAR_ID?.trim()
    if (!token || !calendarId) {
      throw new Error('TimeTree連携が未設定です（TIMETREE_ACCESS_TOKEN / TIMETREE_CALENDAR_ID）。設定するまで同期しません。')
    }

    // TimeTree requires an end; for an open-ended event mirror the start so the
    // API accepts it (a zero-length event at the start time).
    const startAt = event.startsAt
    const endAt = event.endsAt ?? event.startsAt

    const response = await fetch(`${TIMETREE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.timetree.v1+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            category: 'schedule',
            title: event.title,
            all_day: event.allDay,
            start_at: startAt,
            end_at: endAt,
            description: event.description ?? undefined,
            location: event.location ?? undefined,
          },
        },
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`TimeTree同期に失敗しました (${response.status}): ${detail.slice(0, 300)}`)
    }

    const created = (await response.json()) as { data?: { id?: string } }
    return { provider: 'timetree', externalId: created.data?.id }
  }
}
