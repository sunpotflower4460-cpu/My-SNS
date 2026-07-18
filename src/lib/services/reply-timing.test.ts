import { describe, expect, it } from 'vitest'
import { computeRecipientSendTime, ensureMinimumLead, isQuietHour } from './reply-timing'

describe('isQuietHour', () => {
  it('treats a midnight-wrapping window (22→8) correctly', () => {
    expect(isQuietHour(23, 22, 8)).toBe(true) // late night
    expect(isQuietHour(3, 22, 8)).toBe(true) // early morning
    expect(isQuietHour(8, 22, 8)).toBe(false) // exactly the end boundary is waking
    expect(isQuietHour(22, 22, 8)).toBe(true) // exactly the start boundary is quiet
    expect(isQuietHour(14, 22, 8)).toBe(false) // afternoon
  })

  it('treats a non-wrapping window (1→6) correctly', () => {
    expect(isQuietHour(3, 1, 6)).toBe(true)
    expect(isQuietHour(6, 1, 6)).toBe(false)
    expect(isQuietHour(0, 1, 6)).toBe(false)
  })

  it('never counts an empty window as quiet', () => {
    expect(isQuietHour(5, 8, 8)).toBe(false)
  })
})

describe('computeRecipientSendTime (Asia/Tokyo default, quiet 22→8)', () => {
  it('sends promptly during waking hours', () => {
    // 14:00 JST == 05:00 UTC
    const now = new Date('2026-07-18T05:00:00.000Z')
    expect(computeRecipientSendTime(now)).toBe('2026-07-18T05:00:00.000Z')
  })

  it('defers a late-night approval to 08:00 JST the next morning', () => {
    // 23:00 JST on the 18th == 14:00 UTC on the 18th
    const now = new Date('2026-07-18T14:00:00.000Z')
    // 08:00 JST on the 19th == 23:00 UTC on the 18th
    expect(computeRecipientSendTime(now)).toBe('2026-07-18T23:00:00.000Z')
  })

  it('defers an early-morning approval to 08:00 JST the same day', () => {
    // 03:00 JST on the 18th == 18:00 UTC on the 17th
    const now = new Date('2026-07-17T18:00:00.000Z')
    // 08:00 JST on the 18th == 23:00 UTC on the 17th
    expect(computeRecipientSendTime(now)).toBe('2026-07-17T23:00:00.000Z')
  })

  it('treats exactly 22:00 JST as quiet and defers to next morning', () => {
    // 22:00 JST on the 18th == 13:00 UTC on the 18th
    const now = new Date('2026-07-18T13:00:00.000Z')
    expect(computeRecipientSendTime(now)).toBe('2026-07-18T23:00:00.000Z')
  })

  it('treats exactly 08:00 JST as waking and sends promptly', () => {
    // 08:00 JST on the 18th == 23:00 UTC on the 17th
    const now = new Date('2026-07-17T23:00:00.000Z')
    expect(computeRecipientSendTime(now)).toBe('2026-07-17T23:00:00.000Z')
  })
})

describe('computeRecipientSendTime (non-Tokyo timezone)', () => {
  it('honors the recipient timezone offset (America/New_York, EDT in July)', () => {
    // 02:00 EDT (UTC-4) on the 18th == 06:00 UTC on the 18th → quiet
    const now = new Date('2026-07-18T06:00:00.000Z')
    // 08:00 EDT on the 18th == 12:00 UTC on the 18th
    expect(computeRecipientSendTime(now, { timeZone: 'America/New_York' })).toBe('2026-07-18T12:00:00.000Z')
  })

  it('sends promptly during waking hours in the recipient timezone', () => {
    // 15:00 EDT on the 18th == 19:00 UTC on the 18th → waking
    const now = new Date('2026-07-18T19:00:00.000Z')
    expect(computeRecipientSendTime(now, { timeZone: 'America/New_York' })).toBe('2026-07-18T19:00:00.000Z')
  })
})

describe('ensureMinimumLead', () => {
  it('floors a "now" schedule to now + lead so there is always a cancel window', () => {
    const now = new Date('2026-07-18T05:00:00.000Z')
    // recipient time == now (waking) → floored to now + 15 min
    expect(ensureMinimumLead('2026-07-18T05:00:00.000Z', now, 15)).toBe('2026-07-18T05:15:00.000Z')
  })

  it('leaves a schedule already beyond the lead untouched', () => {
    const now = new Date('2026-07-18T05:00:00.000Z')
    // deferred to tomorrow morning → far past the 15-min floor
    expect(ensureMinimumLead('2026-07-18T23:00:00.000Z', now, 15)).toBe('2026-07-18T23:00:00.000Z')
  })

  it('uses the default lead when none is given', () => {
    const now = new Date('2026-07-18T05:00:00.000Z')
    expect(ensureMinimumLead('2026-07-18T05:00:00.000Z', now)).toBe('2026-07-18T05:15:00.000Z')
  })
})
