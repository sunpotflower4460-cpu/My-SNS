import type { CalendarSyncConnector, CalendarSyncEvent, CalendarSyncResult } from './calendar-sync-types'

// Notion calendar sync. Uses an internal integration token (a long-lived secret
// created at https://www.notion.so/my-integrations and shared with the target
// database) plus the id of a database whose schema has at least:
//   - a Title property named "Name"
//   - a Date property named "Date" (start / optional end)
//   - (optional) a rich_text property "Location"
// Server-only. Both env vars must be set or every call fails closed.
// https://developers.notion.com/reference/post-page

const NOTION_API_URL = 'https://api.notion.com/v1/pages'
const NOTION_VERSION = '2022-06-28'

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

    // For an all-day event Notion wants a date-only value; for a timed event a
    // full ISO datetime. We already store absolute UTC ISO, so slice for all-day.
    const date: { start: string; end?: string } = {
      start: event.allDay ? event.startsAt.slice(0, 10) : event.startsAt,
    }
    if (event.endsAt) date.end = event.allDay ? event.endsAt.slice(0, 10) : event.endsAt

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: event.title } }] },
      Date: { date },
    }
    if (event.location) {
      properties.Location = { rich_text: [{ text: { content: event.location } }] }
    }

    const response = await fetch(NOTION_API_URL, {
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
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Notion同期に失敗しました (${response.status}): ${detail.slice(0, 300)}`)
    }

    const created = (await response.json()) as { id?: string; url?: string }
    return { provider: 'notion', externalId: created.id, externalUrl: created.url }
  }
}
