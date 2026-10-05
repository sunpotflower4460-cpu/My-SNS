import { describe, expect, it } from 'vitest'
import { resolveArtistOsMode } from './artist-os-mode'
import { HttpLedgerClient, type ActionKeyParts, type LedgerPort, type LedgerReserveResult } from './action-ledger-client'
import { runWithInboundReplyLedger } from './managed-reply-guard'

const parts: ActionKeyParts = { platform: 'line', operation: 'dm_reply', externalEventId: 'm-100' }
const definitive = (e: unknown) => String((e as Error).message).includes('400')

function fakeLedger(over: Partial<{ reserve: LedgerReserveResult; begin: boolean; complete: boolean | 'throw' }> = {}) {
  const calls: string[] = []
  const completes: unknown[] = []
  const port: LedgerPort = {
    async reserve() {
      calls.push('reserve')
      return over.reserve ?? { status: 'ACQUIRED', reservationToken: 'tok' }
    },
    async begin() {
      calls.push('begin')
      return over.begin ?? true
    },
    async complete(_p, _t, o) {
      calls.push('complete')
      completes.push(o)
      if (over.complete === 'throw') throw new Error('down')
      return over.complete ?? true
    },
  }
  return { port, calls, completes }
}

describe('resolveArtistOsMode', () => {
  it.each([
    [undefined, 'standalone', false],
    ['', 'standalone', false],
    ['standalone', 'standalone', false],
    ['artist_os_managed', 'artist_os_managed', false],
    ['managed', 'artist_os_managed', true],
    ['Standalone', 'artist_os_managed', true],
    ['off', 'artist_os_managed', true],
  ])('%s → %s (invalid=%s)', (raw, mode, invalid) => {
    expect(resolveArtistOsMode({ ARTIST_OS_MODE: raw })).toEqual({ mode, modeInvalid: invalid })
  })
})

describe('runWithInboundReplyLedger', () => {
  it('standalone: sends exactly as before and never touches the ledger', async () => {
    const l = fakeLedger()
    let sends = 0
    const r = await runWithInboundReplyLedger({ mode: 'standalone', ledger: l.port, parts, send: async () => ++sends, isDefinitiveFailure: definitive })
    expect(r).toEqual({ kind: 'sent', value: 1, ledgerRecorded: false })
    expect(l.calls).toEqual([])
  })

  it('standalone: provider errors propagate untouched', async () => {
    await expect(runWithInboundReplyLedger({ mode: 'standalone', ledger: null, parts: null, send: async () => Promise.reject(new Error('boom')), isDefinitiveFailure: definitive })).rejects.toThrow('boom')
  })

  it('managed: reserve → begin → send → complete(succeeded) in that order, recording the provider ref', async () => {
    const l = fakeLedger()
    const order: string[] = []
    const r = await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: l.port, parts, send: async () => (order.push(`send after ${l.calls.join('>')}`), { externalMessageId: 'ext-1' }), isDefinitiveFailure: definitive })
    expect(r).toMatchObject({ kind: 'sent', ledgerRecorded: true })
    expect(order).toEqual(['send after reserve>begin'])
    expect(l.calls).toEqual(['reserve', 'begin', 'complete'])
    expect(l.completes).toEqual([{ outcome: 'succeeded', outcomeRef: 'ext-1' }])
  })

  it.each(['ALREADY_RESERVED', 'ALREADY_SUCCEEDED', 'OUTCOME_UNKNOWN', 'CONFLICT'] as const)('managed: %s ⇒ the provider is NEVER called', async (status) => {
    const l = fakeLedger({ reserve: { status } })
    let sends = 0
    const r = await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: l.port, parts, send: async () => ++sends, isDefinitiveFailure: definitive })
    expect(r).toMatchObject({ kind: 'blocked', reason: status })
    expect(sends).toBe(0)
    expect(l.calls).toEqual(['reserve'])
  })

  it('managed: ledger unavailable ⇒ fail closed, no send', async () => {
    const l = fakeLedger({ reserve: { status: 'LEDGER_UNAVAILABLE', detail: 'HTTP 503' } })
    let sends = 0
    expect(await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: l.port, parts, send: async () => ++sends, isDefinitiveFailure: definitive })).toMatchObject({ kind: 'blocked', reason: 'LEDGER_UNAVAILABLE' })
    expect(sends).toBe(0)
  })

  it('managed: no ledger configured, or an unusable event id ⇒ fail closed', async () => {
    let sends = 0
    const send = async () => ++sends
    expect(await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: null, parts, send, isDefinitiveFailure: definitive })).toMatchObject({ kind: 'blocked', reason: 'LEDGER_NOT_CONFIGURED' })
    expect(await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: fakeLedger().port, parts: null, send, isDefinitiveFailure: definitive })).toMatchObject({ kind: 'blocked', reason: 'INVALID_ACTION_KEY' })
    expect(await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: fakeLedger().port, parts: { ...parts, externalEventId: 'has:colon' }, send, isDefinitiveFailure: definitive })).toMatchObject({ kind: 'blocked', reason: 'INVALID_ACTION_KEY' })
    expect(sends).toBe(0)
  })

  it('managed: begin refused ⇒ no send', async () => {
    const l = fakeLedger({ begin: false })
    let sends = 0
    expect(await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: l.port, parts, send: async () => ++sends, isDefinitiveFailure: definitive })).toMatchObject({ kind: 'blocked', reason: 'BEGIN_REFUSED' })
    expect(sends).toBe(0)
  })

  it('managed: a definitive provider rejection is recorded failed_safe; an uncertain one OUTCOME_UNKNOWN', async () => {
    const a = fakeLedger()
    const ra = await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: a.port, parts, send: async () => Promise.reject(new Error('HTTP 400 bad')), isDefinitiveFailure: definitive })
    expect(ra).toMatchObject({ kind: 'failed', safeToRetry: true, ledgerRecorded: true })
    expect(a.completes[0]).toMatchObject({ outcome: 'failed_safe' })
    const b = fakeLedger()
    const rb = await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: b.port, parts, send: async () => Promise.reject(new Error('timeout')), isDefinitiveFailure: definitive })
    expect(rb).toMatchObject({ kind: 'failed', safeToRetry: false })
    expect(b.completes[0]).toMatchObject({ outcome: 'unknown' })
  })

  it('managed: sent but the ledger cannot record it ⇒ still reported as sent (never re-sent), flagged unrecorded', async () => {
    const l = fakeLedger({ complete: 'throw' })
    const r = await runWithInboundReplyLedger({ mode: 'artist_os_managed', ledger: l.port, parts, send: async () => ({}), isDefinitiveFailure: definitive })
    expect(r).toMatchObject({ kind: 'sent', ledgerRecorded: false })
  })
})

describe('HttpLedgerClient', () => {
  const mk = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
    new HttpLedgerClient({ baseUrl: 'https://aos.test', token: 'secret-token', fetchImpl: (async (u: string, i: RequestInit) => handler(String(u), i)) as typeof fetch })

  it('sends the token only as a Bearer header and never in the body', async () => {
    let seen: RequestInit | undefined
    const c = mk((_u, i) => ((seen = i), Response.json({ status: 'ACQUIRED', reservationToken: 't1' })))
    expect(await c.reserve(parts)).toEqual({ status: 'ACQUIRED', reservationToken: 't1' })
    expect((seen!.headers as Record<string, string>).authorization).toBe('Bearer secret-token')
    expect(String(seen!.body)).not.toContain('secret-token')
  })
  it.each([
    ['network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['HTTP 503', () => new Response('{}', { status: 503 })],
    ['HTTP 401', () => new Response('{}', { status: 401 })],
    ['unrecognized body', () => Response.json({ status: 'MAYBE' })],
    ['ACQUIRED without a token', () => Response.json({ status: 'ACQUIRED' })],
  ])('%s ⇒ LEDGER_UNAVAILABLE (never permission to send)', async (_n, h) => {
    expect((await mk(h as never).reserve(parts)).status).toBe('LEDGER_UNAVAILABLE')
  })
  it('maps ledger answers through unchanged', async () => {
    for (const status of ['ALREADY_RESERVED', 'ALREADY_SUCCEEDED', 'OUTCOME_UNKNOWN', 'CONFLICT']) {
      expect((await mk(() => Response.json({ status })).reserve(parts)).status).toBe(status)
    }
  })
})
