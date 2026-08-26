import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotionCalendarConnector, isNotionCalendarConfigured } from './notion-calendar'

describe('NotionCalendarConnector', () => {
  const saved = { token: process.env.NOTION_INTEGRATION_TOKEN, db: process.env.NOTION_CALENDAR_DATABASE_ID }

  afterEach(() => {
    if (saved.token === undefined) delete process.env.NOTION_INTEGRATION_TOKEN
    else process.env.NOTION_INTEGRATION_TOKEN = saved.token
    if (saved.db === undefined) delete process.env.NOTION_CALENDAR_DATABASE_ID
    else process.env.NOTION_CALENDAR_DATABASE_ID = saved.db
    vi.restoreAllMocks()
  })

  it('fails closed (throws, no request) when unconfigured', async () => {
    delete process.env.NOTION_INTEGRATION_TOKEN
    delete process.env.NOTION_CALENDAR_DATABASE_ID
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(isNotionCalendarConfigured()).toBe(false)
    await expect(new NotionCalendarConnector().syncEvent({ title: 'x', startsAt: '2026-07-21T06:00:00.000Z', allDay: false })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  describe('when configured', () => {
    beforeEach(() => {
      process.env.NOTION_INTEGRATION_TOKEN = 'secret'
      process.env.NOTION_CALENDAR_DATABASE_ID = 'db-123'
    })

    it('sends the JST calendar date for an all-day event, not the UTC-sliced date', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ id: 'page-1', url: 'https://notion.so/page-1' }), { status: 200 }),
      )

      const result = await new NotionCalendarConnector().syncEvent({
        title: '終日イベント',
        startsAt: '2026-07-21T15:00:00.000Z',
        allDay: true,
      })

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      expect(body.properties.Date.date.start).toBe('2026-07-22')
      expect(result.externalId).toBe('page-1')
    })

    it('sends the full ISO datetime for a timed event', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'p' }), { status: 200 }))
      await new NotionCalendarConnector().syncEvent({ title: 't', startsAt: '2026-07-21T06:00:00.000Z', allDay: false })
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      expect(body.properties.Date.date.start).toBe('2026-07-21T06:00:00.000Z')
    })

    it('treats an explicit 4xx rejection as a normal confirmed failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 401 }))
      const promise = new NotionCalendarConnector().syncEvent({ title: 'x', startsAt: '2026-07-21T06:00:00.000Z', allDay: false })
      await expect(promise).rejects.toThrow(/Notion同期に失敗/)
      await expect(promise).rejects.not.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })

    it('marks a provider 5xx after create POST as externally unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('temporary', { status: 503 }))
      await expect(
        new NotionCalendarConnector().syncEvent({ title: 'x', startsAt: '2026-07-21T06:00:00.000Z', allDay: false }),
      ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })

    it('marks a lost create response as externally unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
      await expect(
        new NotionCalendarConnector().syncEvent({ title: 'x', startsAt: '2026-07-21T06:00:00.000Z', allDay: false }),
      ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })

    it('marks a success response without a page id as externally unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ url: 'https://notion.so/maybe' }), { status: 200 }))
      await expect(
        new NotionCalendarConnector().syncEvent({ title: 'x', startsAt: '2026-07-21T06:00:00.000Z', allDay: false }),
      ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })
  })
})
