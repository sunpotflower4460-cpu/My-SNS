import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CALENDAR_SYNC_PROVIDERS, configuredCalendarSyncProviders, syncEventToProviders } from './calendar-sync'
import { isNotionCalendarConfigured } from './connectors/notion-calendar'
import { isTimeTreeCalendarConfigured } from './connectors/timetree-calendar'
import type { CalendarSyncEvent } from './connectors/calendar-sync-types'

const EVENT: CalendarSyncEvent = {
  title: '打ち合わせ',
  startsAt: '2026-07-21T06:00:00.000Z',
  endsAt: '2026-07-21T07:00:00.000Z',
  allDay: false,
  location: 'オンライン',
}

const SYNC_ENV = [
  'NOTION_INTEGRATION_TOKEN',
  'NOTION_CALENDAR_DATABASE_ID',
  'TIMETREE_ACCESS_TOKEN',
  'TIMETREE_CALENDAR_ID',
] as const

describe('calendar sync — fail-closed when unconfigured', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of SYNC_ENV) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of SYNC_ENV) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('keeps the provider ordering stable for durable claim/result mapping', () => {
    expect(CALENDAR_SYNC_PROVIDERS).toEqual(['notion', 'timetree'])
  })

  it('reports no configured providers when env is unset', () => {
    expect(isNotionCalendarConfigured()).toBe(false)
    expect(isTimeTreeCalendarConfigured()).toBe(false)
    expect(configuredCalendarSyncProviders()).toEqual([])
  })

  it('returns unavailable (never a fake success) for every provider when unconfigured', async () => {
    const outcomes = await syncEventToProviders(EVENT)
    expect(outcomes).toHaveLength(2)
    expect(outcomes.every((o) => o.status === 'unavailable')).toBe(true)
    expect(outcomes.map((o) => o.provider).sort()).toEqual(['notion', 'timetree'])
    // No external ids are invented when nothing actually synced.
    expect(outcomes.every((o) => o.externalId === undefined)).toBe(true)
  })

  it('only evaluates providers explicitly claimed by the caller', async () => {
    const outcomes = await syncEventToProviders(EVENT, ['notion'])
    expect(outcomes).toEqual([{ provider: 'notion', status: 'unavailable' }])
  })

  it('detects a provider as configured only when BOTH of its env vars are set', () => {
    process.env.NOTION_INTEGRATION_TOKEN = 'secret'
    expect(isNotionCalendarConfigured()).toBe(false) // database id still missing
    process.env.NOTION_CALENDAR_DATABASE_ID = 'db-123'
    expect(isNotionCalendarConfigured()).toBe(true)
    expect(configuredCalendarSyncProviders()).toEqual(['notion'])
  })
})
