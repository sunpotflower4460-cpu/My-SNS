import type { CalendarSyncConnector, CalendarSyncEvent, CalendarSyncResult } from './calendar-sync-types'

const NOTION_API_URL = 'https://api.notion.com/v1/pages'
const NOTION_VERSION = '2022-06-28'
const CALENDAR_CREATE_TIMEOUT_MS = 30_000

export function isNotionCalendarConfigured(): boolean {
  return Boolean(process.env.NOTION_INTEGRATION_TOKEN?.trim() && process.env.NOTION_CALENDAR_DATABASE_ID?.trim())
}

export class NotionCalendarConnector implements CalendarSyncConnector {
  readonly provider = 'notion' as const

  isConfigured(): boolean {
    return isNotionCalendarConfigured()
  }

  async syncEvent(event: CalendarSyncEvent): Promise<CalendarSyncResult> {
    const token = process.env.NOTION_INTEGRATION_TOKEN?.trim()
    const databaseId = process.env.NOTION_CALENDAR_DATABASE_ID?.trim()
    if (!token || !databaseId) {
      throw new Error('Notion連携が未設定です（NOTION_INTEGRATION_TOKEN / NOTION_CALENDAR_DATABASE_ID）。設定するまで同期しません。')
    }

    const jstDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
    const date: { start: string; end?: string } = {
      start: event.allDay ? jstDate(event.startsAt) : event.startsAt,
    }
    if (event.endsAt) date.end = event.allDay ? jstDate(event.endsAt) : event.endsAt

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: event.title } }] },
      Date: { date },
    }
    if (event.location) {
      properties.Location = { rich_text: [{ text: { content: event.location } }] }
    }

    let response: Response
    try {
      response = await fetch(NOTION_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties,
          children: event.description
            ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: event.description } }] } }]
            : undefined,
        }),
        signal: AbortSignal.timeout(CALENDAR_CREATE_TIMEOUT_MS),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'network error'
      throw new Error(
        `EXTERNAL_RESULT_UNKNOWN: Notion予定作成の応答を確認できませんでした（${detail}）。予定が作成済みの可能性があるため、自動再試行を停止します。`,
      )
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status >= 500) {
        throw new Error(
          `EXTERNAL_RESULT_UNKNOWN: Notion予定作成は${response.status}を返しました。予定が作成済みの可能性があるため、自動再試行を停止します。詳細: ${detail.slice(0, 200)}`,
        )
      }
      throw new Error(`Notion同期に失敗しました (${response.status}): ${detail.slice(0, 300)}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: Notionは予定作成リクエストを受理しましたが、応答を読み取れませんでした。重複防止のため再試行を停止します。',
      )
    }

    const created = payload as { id?: unknown; url?: unknown } | null
    if (typeof created?.id !== 'string' || !created.id) {
      throw new Error(
        'EXTERNAL_RESULT_UNKNOWN: Notionは成功応答を返しましたが予定IDがありません。予定が作成済みの可能性があるため再試行を停止します。',
      )
    }

    return {
      provider: 'notion',
      externalId: created.id,
      externalUrl: typeof created.url === 'string' ? created.url : undefined,
    }
  }
}
