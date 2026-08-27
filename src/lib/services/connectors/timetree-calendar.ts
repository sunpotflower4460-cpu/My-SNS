import type { CalendarSyncConnector, CalendarSyncEvent, CalendarSyncResult } from './calendar-sync-types'

const TIMETREE_API_BASE = 'https://timetreeapis.com'
const CALENDAR_CREATE_TIMEOUT_MS = 30_000

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

    const startAt = event.startsAt
    const endAt = event.endsAt ?? event.startsAt

    let response: Response
    try {
      response = await fetch(`${TIMETREE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
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
              start_timezone: 'Asia/Tokyo',
              end_at: endAt,
              end_timezone: 'Asia/Tokyo',
              description: event.description ?? undefined,
              location: event.location ?? undefined,
            },
          },
        }),
        signal: AbortSignal.timeout(CALENDAR_CREATE_TIMEOUT_MS),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'network error'
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: TimeTree予定作成の応答を確認できませんでした（${detail}）。予定が作成済みの可能性があるため、自動再試行を停止します。`,
      )
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status >= 500) {
        throw new Error(
          `EXTERNAL_RESULT_UNKNOWN: TimeTree予定作成は${response.status}を返しました。予定が作成済みの可能性があるため、自動再試行を停止します。詳細: ${detail.slice(0, 200)}`,
        )
      }
      throw new Error(`TimeTree同期に失敗しました (${response.status}): ${detail.slice(0, 300)}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: TimeTreeは予定作成リクエストを受理しましたが、応答を読み取れませんでした。重複防止のため再試行を停止します。',
      )
    }

    const externalId = (payload as { data?: { id?: unknown } } | null)?.data?.id
    if (typeof externalId !== 'string' || !externalId) {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: TimeTreeは成功応答を返しましたが予定IDがありません。予定が作成済みの可能性があるため再試行を停止します。',
      )
    }

    return { provider: 'timetree', externalId }
  }
}
