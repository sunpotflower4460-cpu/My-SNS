import { describe, expect, it } from 'vitest'
import { buildUpcomingAgenda, summarizeSyncOutcomes } from './calendar-presenter'
import type { CalendarEvent } from '@/lib/domain/types'
import type { ProviderSyncOutcome } from '@/lib/services/calendar-sync'

function event(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    workspaceId: 'w',
    title: '予定',
    startsAt: '2026-07-20T02:00:00Z',
    allDay: false,
    source: 'manual',
    createdBy: 'u',
    createdAt: '2026-07-19T00:00:00Z',
    updatedAt: '2026-07-19T00:00:00Z',
    ...over,
  }
}

describe('buildUpcomingAgenda', () => {
  // now = 2026-07-20T04:00:00Z == 13:00 JST on 2026-07-20.
  const now = new Date('2026-07-20T04:00:00Z').getTime()

  it('drops past days, groups by JST day, soonest first', () => {
    const groups = buildUpcomingAgenda(
      [
        event({ id: 'past', startsAt: '2026-07-19T02:00:00Z' }),
        event({ id: 'today', startsAt: '2026-07-20T06:00:00Z' }),
        event({ id: 'future', startsAt: '2026-07-22T02:00:00Z' }),
      ],
      now,
    )
    expect(groups.map((g) => g.day)).toEqual(['2026-07-20', '2026-07-22'])
    expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([['today'], ['future']])
  })

  it('labels today and tomorrow (JST)', () => {
    const groups = buildUpcomingAgenda(
      [
        event({ id: 'today', startsAt: '2026-07-20T06:00:00Z' }),
        event({ id: 'tomorrow', startsAt: '2026-07-21T06:00:00Z' }),
        event({ id: 'later', startsAt: '2026-07-25T06:00:00Z' }),
      ],
      now,
    )
    expect(groups.map((g) => g.relativeLabel)).toEqual(['今日', '明日', null])
  })

  it('keeps an event scheduled later today (JST) even though its UTC date is tomorrow', () => {
    // 2026-07-20T15:30:00Z == 2026-07-21T00:30 JST — that's tomorrow in JST, so excluded from today.
    // 2026-07-20T13:00:00Z == 2026-07-20T22:00 JST — still today.
    const groups = buildUpcomingAgenda(
      [
        event({ id: 'tonight', startsAt: '2026-07-20T13:00:00Z' }),
        event({ id: 'after-midnight', startsAt: '2026-07-20T15:30:00Z' }),
      ],
      now,
    )
    expect(groups.map((g) => g.day)).toEqual(['2026-07-20', '2026-07-21'])
    expect(groups[0].relativeLabel).toBe('今日')
    expect(groups[1].relativeLabel).toBe('明日')
  })

  it('orders events within a day by start time', () => {
    const groups = buildUpcomingAgenda(
      [
        event({ id: 'evening', startsAt: '2026-07-20T10:00:00Z' }),
        event({ id: 'morning', startsAt: '2026-07-20T00:30:00Z' }),
      ],
      now,
    )
    expect(groups[0].events.map((e) => e.id)).toEqual(['morning', 'evening'])
  })
})

describe('summarizeSyncOutcomes', () => {
  const outcome = (over: Partial<ProviderSyncOutcome>): ProviderSyncOutcome => ({ provider: 'notion', status: 'synced', ...over })

  it('reports a fail-closed hint when nothing is configured', () => {
    const msg = summarizeSyncOutcomes([outcome({ provider: 'notion', status: 'unavailable' }), outcome({ provider: 'timetree', status: 'unavailable' })])
    expect(msg.feedback).toBeUndefined()
    expect(msg.error).toContain('未設定')
  })

  it('reports what synced', () => {
    const msg = summarizeSyncOutcomes([outcome({ provider: 'notion', status: 'synced' })])
    expect(msg.feedback).toBe('Notionに同期しました。')
    expect(msg.error).toBeUndefined()
  })

  it('reports partial success and failure together', () => {
    const msg = summarizeSyncOutcomes([
      outcome({ provider: 'notion', status: 'synced' }),
      outcome({ provider: 'timetree', status: 'failed' }),
    ])
    expect(msg.feedback).toBe('Notionに同期しました。')
    expect(msg.error).toContain('TimeTree')
  })
})
