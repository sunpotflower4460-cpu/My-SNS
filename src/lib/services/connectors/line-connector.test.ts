import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLineResultUnknownError, LineConnectorAdapter } from './line-connector'

function mockResponse(init: { ok: boolean; status: number; body?: string; requestId?: string }): Response {
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers(init.requestId ? { 'x-line-request-id': init.requestId } : {}),
    text: async () => init.body ?? '',
  } as unknown as Response
}

const request = {
  platform: 'line' as const,
  accessToken: 'token',
  target: 'U123',
  text: 'こんにちは',
}

describe('LineConnectorAdapter.sendMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns LINE request id after a confirmed successful push', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, requestId: 'req-1' })))

    const result = await new LineConnectorAdapter().sendMessage(request)

    expect(result).toEqual({ externalMessageId: 'req-1' })
  })

  it('marks a lost network response as externally unknown so automatic retry can be blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const promise = new LineConnectorAdapter().sendMessage(request)
    await expect(promise).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN: LINE push/)
    await promise.catch((cause: unknown) => {
      expect(isLineResultUnknownError(cause instanceof Error ? cause.message : '')).toBe(true)
    })
  })

  it('treats provider 5xx after the push POST as externally unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 503, body: 'temporary error' })))

    await expect(new LineConnectorAdapter().sendMessage(request)).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN: LINE push/)
  })

  it('keeps explicit 4xx rejection as an ordinary failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 400, body: 'bad request' })))

    const promise = new LineConnectorAdapter().sendMessage(request)
    await expect(promise).rejects.toThrow(/LINE push failed \(400\)/)
    await promise.catch((cause: unknown) => {
      expect(isLineResultUnknownError(cause instanceof Error ? cause.message : '')).toBe(false)
    })
  })
})
