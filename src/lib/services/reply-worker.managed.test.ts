import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessage = vi.fn()
vi.mock('@/lib/services/connectors', () => ({ getConnectorAdapter: () => ({ sendMessage }) }))
vi.mock('@/lib/services/publish-worker', async (orig) => ({ ...(await orig<typeof import('@/lib/services/publish-worker')>()), resolveCredentials: vi.fn(async () => ({ accessToken: 'line-token', externalAccountId: 'acct' })) }))
vi.mock('@/lib/repositories/supabase/reply-attempts', () => ({ recordReplyAttempt: vi.fn(async () => undefined) }))
vi.mock('@/lib/repositories/supabase/notifications', () => ({ createNotifications: vi.fn(async () => undefined) }))

import { processReplyJob, type ReplyableJob } from './reply-worker'
import { recordReplyAttempt } from '@/lib/repositories/supabase/reply-attempts'

const job: ReplyableJob = { id: 'job-1', workspaceId: 'w1', platform: 'line', inboxItemId: 'inbox-1', sendTarget: 'U1', replyText: 'hello', createdBy: 'u1' }

/** Minimal chainable Supabase double: every query resolves to the configured data for its table. */
function fakeSupabase(inbox: { platform: string; kind: string; external_id: string | null } | null) {
  const chain = (table: string): unknown => {
    const result = () => {
      if (table === 'inbox_items') return { data: inbox, error: null }
      if (table === 'reply_jobs') return { data: { id: job.id }, error: null }
      return { data: null, error: null }
    }
    const handler: ProxyHandler<object> = {
      get: (_t, prop) => {
        if (prop === 'then') return undefined
        if (prop === 'maybeSingle' || prop === 'single') return async () => result()
        // `.insert()` / bare awaits resolve to an empty result
        return () => new Proxy({}, handler)
      },
    }
    return new Proxy({}, handler)
  }
  return { from: (t: string) => chain(t) } as never
}

const env = process.env
beforeEach(() => {
  sendMessage.mockReset()
  sendMessage.mockResolvedValue({ externalMessageId: 'ext-9' })
  vi.mocked(recordReplyAttempt).mockClear()
})
afterEach(() => {
  process.env = { ...env }
  delete process.env.ARTIST_OS_MODE
  delete process.env.ARTIST_OS_LEDGER_URL
  delete process.env.ARTIST_OS_LEDGER_TOKEN
  vi.unstubAllGlobals()
})

function stubLedger(answers: { reserve?: unknown; status?: number } = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = new URL(String(url)).pathname
    calls.push({ path, body: JSON.parse(String(init.body)) })
    if (answers.status && answers.status >= 400) return new Response('{}', { status: answers.status })
    if (path.endsWith('/reserve')) return Response.json(answers.reserve ?? { status: 'ACQUIRED', reservationToken: 'tok' })
    return Response.json({ ok: true })
  })
  return calls
}

describe('processReplyJob × Artist OS mode', () => {
  it('standalone (default): sends as before and never contacts the ledger', async () => {
    const calls = stubLedger()
    const r = await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)
    expect(r.success).toBe(true)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(0)
  })

  it('managed + ledger configured: reserve → begin → send → complete with a key from the NATIVE event id', async () => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    process.env.ARTIST_OS_LEDGER_URL = 'https://aos.test'
    process.env.ARTIST_OS_LEDGER_TOKEN = 'ledger-secret'
    const calls = stubLedger()
    const r = await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)
    expect(r.success).toBe(true)
    expect(calls.map((c) => c.path)).toEqual(['/api/ledger/reserve', '/api/ledger/begin', '/api/ledger/complete'])
    expect(calls[0]!.body).toEqual({ platform: 'line', operation: 'dm_reply', externalEventId: 'm-100' })
    expect(JSON.stringify(calls)).not.toContain('hello') // the reply text is never part of the ledger identity
    expect(calls[2]!.body).toMatchObject({ outcome: 'succeeded', outcomeRef: 'ext-9' })
  })

  it.each(['ALREADY_RESERVED', 'ALREADY_SUCCEEDED', 'OUTCOME_UNKNOWN', 'CONFLICT'])('managed + ledger says %s ⇒ the provider is never called', async (status) => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    process.env.ARTIST_OS_LEDGER_URL = 'https://aos.test'
    process.env.ARTIST_OS_LEDGER_TOKEN = 't'
    stubLedger({ reserve: { status } })
    const r = await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)
    expect(r.success).toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(vi.mocked(recordReplyAttempt).mock.calls[0]![1]).toMatchObject({ status: 'failed' })
    expect(String((vi.mocked(recordReplyAttempt).mock.calls[0]![1] as { errorMessage: string }).errorMessage)).toContain('MANAGED_MODE_BLOCKED')
  })

  it('managed + ledger unavailable (HTTP 503) ⇒ fail closed', async () => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    process.env.ARTIST_OS_LEDGER_URL = 'https://aos.test'
    process.env.ARTIST_OS_LEDGER_TOKEN = 't'
    stubLedger({ status: 503 })
    expect((await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)).success).toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('managed + ledger not configured ⇒ fail closed', async () => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    expect((await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)).success).toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('an invalid ARTIST_OS_MODE value is treated as managed (most restrictive), so it also fails closed', async () => {
    process.env.ARTIST_OS_MODE = 'managd'
    expect((await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)).success).toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('managed + inbox item without a native external id ⇒ cannot coordinate, no send', async () => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    process.env.ARTIST_OS_LEDGER_URL = 'https://aos.test'
    process.env.ARTIST_OS_LEDGER_TOKEN = 't'
    const calls = stubLedger()
    expect((await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: null }), job)).success).toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('managed: an explicit LINE 4xx rejection is failed_safe; 409/5xx/unrecognised text are NOT (uncertain ⇒ fail closed)', async () => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    process.env.ARTIST_OS_LEDGER_URL = 'https://aos.test'
    process.env.ARTIST_OS_LEDGER_TOKEN = 't'
    const cases: [string, string][] = [
      ['LINE push failed (400): bad request', 'failed_safe'],
      ['LINE push failed (429): too many', 'failed_safe'],
      ['LINE push failed (409): conflict', 'unknown'],
      ['EXTERNAL_RESULT_UNKNOWN: LINE returned 502', 'unknown'],
      ['something we have never seen', 'unknown'],
    ]
    for (const [message, outcome] of cases) {
      const calls = stubLedger()
      sendMessage.mockRejectedValue(new Error(message))
      await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)
      expect(calls.at(-1)!.body, message).toMatchObject({ outcome })
    }
  })

  it('managed: a timeout from the provider is reported to the ledger as OUTCOME_UNKNOWN (not retryable)', async () => {
    process.env.ARTIST_OS_MODE = 'artist_os_managed'
    process.env.ARTIST_OS_LEDGER_URL = 'https://aos.test'
    process.env.ARTIST_OS_LEDGER_TOKEN = 't'
    const calls = stubLedger()
    sendMessage.mockRejectedValue(new Error('request timed out'))
    expect((await processReplyJob(fakeSupabase({ platform: 'line', kind: 'dm', external_id: 'm-100' }), job)).success).toBe(false)
    expect(calls.at(-1)!.body).toMatchObject({ outcome: 'unknown' })
  })
})
