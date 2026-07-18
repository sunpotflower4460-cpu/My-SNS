import { describe, expect, it } from 'vitest'
import { parseScheduleProposals } from './anthropic-schedule'

describe('parseScheduleProposals', () => {
  it('parses events and normalizes +09:00 starts to UTC ISO', () => {
    const result = parseScheduleProposals({
      events: [
        { title: '田中さんと打ち合わせ', startsAt: '2026-07-21T15:00:00+09:00', endsAt: '2026-07-21T16:00:00+09:00', allDay: false, location: 'オンライン', note: '「来週火曜15時」を解釈' },
      ],
    })
    expect(result).toEqual([
      {
        title: '田中さんと打ち合わせ',
        startsAt: '2026-07-21T06:00:00.000Z', // 15:00 JST == 06:00 UTC
        endsAt: '2026-07-21T07:00:00.000Z',
        allDay: false,
        location: 'オンライン',
        note: '「来週火曜15時」を解釈',
      },
    ])
  })

  it('returns an empty array when there are no events (the common case)', () => {
    expect(parseScheduleProposals({ events: [] })).toEqual([])
  })

  it('drops an event with no resolvable start date', () => {
    const result = parseScheduleProposals({
      events: [
        { title: 'あいまいな予定', startsAt: '来週のどこか', allDay: false },
        { title: '有効な予定', startsAt: '2026-07-21T09:00:00+09:00', allDay: false },
      ],
    })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('有効な予定')
  })

  it('drops an event missing a title', () => {
    const result = parseScheduleProposals({ events: [{ startsAt: '2026-07-21T09:00:00+09:00', allDay: false }] })
    expect(result).toEqual([])
  })

  it('drops an end that precedes the start but keeps the event', () => {
    const [event] = parseScheduleProposals({
      events: [{ title: 'x', startsAt: '2026-07-21T15:00:00+09:00', endsAt: '2026-07-21T14:00:00+09:00', allDay: false }],
    })
    expect(event.endsAt).toBeUndefined()
    expect(event.startsAt).toBe('2026-07-21T06:00:00.000Z')
  })

  it('drops an unparseable end but keeps the event', () => {
    const [event] = parseScheduleProposals({
      events: [{ title: 'x', startsAt: '2026-07-21T15:00:00+09:00', endsAt: 'あとで', allDay: false }],
    })
    expect(event.endsAt).toBeUndefined()
  })

  it('treats a naive datetime (no offset) as JST, not the server clock — the 9h-shift guard', () => {
    // The model omitted the +09:00 offset but meant JST 15:00. Without the guard
    // this would parse against the server's UTC clock and land at 15:00Z.
    const [event] = parseScheduleProposals({
      events: [{ title: 'x', startsAt: '2026-07-21T15:00:00', endsAt: '2026-07-21T16:00:00', allDay: false }],
    })
    expect(event.startsAt).toBe('2026-07-21T06:00:00.000Z') // 15:00 JST, correct
    expect(event.endsAt).toBe('2026-07-21T07:00:00.000Z')
  })

  it('respects an explicit Z (UTC) offset when the model gives one', () => {
    const [event] = parseScheduleProposals({ events: [{ title: 'x', startsAt: '2026-07-21T15:00:00Z', allDay: false }] })
    expect(event.startsAt).toBe('2026-07-21T15:00:00.000Z')
  })

  it('throws when the tool output has no events array', () => {
    expect(() => parseScheduleProposals({})).toThrow()
    expect(() => parseScheduleProposals(undefined)).toThrow()
  })
})
