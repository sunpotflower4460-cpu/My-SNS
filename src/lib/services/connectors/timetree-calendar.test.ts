import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimeTreeCalendarConnector, isTimeTreeCalendarConfigured } from './timetree-calendar'

describe('TimeTreeCalendarConnector', () => {
  const saved = {
    token: process.env.TIMETREE_ACCESS_TOKEN,
    calendarId: process.env.TIMETREE_CALENDAR_ID,
  }

  afterEach(() => {
    if (saved.token === undefined) delete process.env.TIMETREE_ACCESS_TOKEN
    else process.env.TIMETREE_ACCESS_TOKEN = saved.token
    if (saved.calendarId === undefined) delete process.env.TIMETREE_CALENDAR_ID
    else process.env.TIMETREE_CALENDAR_ID = saved.calendarId
    vi.restoreAllMocks()
  })

  it('fails closed without configured credentials and makes no request', async () => {
    delete process.env.TIMETREE_ACCESS_TOKEN
    delete process.env.TIMETREE_CALENDAR_ID
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(isTimeTreeCalendarConfigured()).toBe(false)
    await expect(
      new TimeTreeCalendarConnector().syncEvent({
        title: 'x',
        startsAt: '2026-07-21T06:00:00.000Z',
        allDay: false,
      }),
    ).rejects.toThrow(/未設定/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  describe('when configured', () => {
    beforeEach(() => {
      process.env.TIMETREE_ACCESS_TOKEN = 'secret'
      process.env.TIMETREE_CALENDAR_ID = 'calendar-123'
    })

    it('returns the provider event id on confirmed success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'event-1' } }), { status: 200 }),
      )

      await expect(
        new TimeTreeCalendarConnector().syncEvent({
          title: '予定',
          startsAt: '2026-07-21T06:00:00.000Z',
          allDay: false,
        }),
      ).resolves.toEqual({ provider: 'timetree', externalId: 'event-1' })
    })

    it('keeps an explicit 4xx rejection as a confirmed ordinary failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad request', { status: 422 }))

      await expect(
        new TimeTreeCalendarConnector().syncEvent({
          title: 'x',
          startsAt: '2026-07-21T06:00:00.000Z',
          allDay: false,
        }),
      ).rejects.toThrow(/^TimeTree同期に失敗しました/)
    })

    it('marks a provider 5xx after create POST as externally unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('temporary', { status: 503 }))

      await expect(
        new TimeTreeCalendarConnector().syncEvent({
          title: 'x',
          startsAt: '2026-07-21T06:00:00.000Z',
          allDay: false,
        }),
      ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })

    it('marks a lost create response as externally unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

      await expect(
        new TimeTreeCalendarConnector().syncEvent({
          title: 'x',
          startsAt: '2026-07-21T06:00:00.000Z',
          allDay: false,
        }),
      ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })

    it('marks a success response without an event id as externally unknown', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))

      await expect(
        new TimeTreeCalendarConnector().syncEvent({
          title: 'x',
          startsAt: '2026-07-21T06:00:00.000Z',
          allDay: false,
        }),
      ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    })
  })
})
