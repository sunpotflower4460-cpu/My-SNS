import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLineResultUnknownError, LineConnectorAdapter } from './line-connector'

function mockResponse(init: {
  ok: boolean
  status: number
  body?: string
  requestId?: string
  acceptedRequestId?: string
}): Response {
  const headers: Record<string, string> = {}
  if (init.requestId) headers['x-line-request-id'] = init.requestId
  if (init.acceptedRequestId) headers['x-line-accepted-request-id'] = init.acceptedRequestId
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers(headers),
    text: async () => init.body ?? '',
  } as unknown as Response
}

const request = {
  platform: 'line' as const,
  accessToken: 'token',
  target: 'U123',
  text: 'こんにちは',
  retryKey: '123e4567-e89b-12d3-a456-426614174000',
}

describe('LineConnectorAdapter.sendMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the stable retry key on the first LINE push and returns its request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, requestId: 'req-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new LineConnectorAdapter().sendMessage(request)

    expect(result).toEqual({ externalMessageId: 'req-1' })
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('X-Line-Retry-Key')).toBe(request.retryKey)
  })

  it('fails closed before contacting LINE when no retry key is supplied', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new LineConnectorAdapter().sendMessage({
        platform: 'line',
        accessToken: 'token',
        target: 'U123',
        text: 'こんにちは',
      }),
    ).rejects.toThrow(/retry key is required/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats LINE 409 with accepted request id as confirmed prior success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 409,
          body: '{"message":"The retry key is already accepted"}',
          requestId: 'retry-request',
          acceptedRequestId: 'original-request',
        }),
      ),
    )

    await expect(new LineConnectorAdapter().sendMessage(request)).resolves.toEqual({
      externalMessageId: 'original-request',
    })
  })

  it('keeps a 409 without accepted request id externally unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 409, body: 'conflict' })))

    await expect(new LineConnectorAdapter().sendMessage(request)).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN: LINE push/)
  })

  it('marks a lost network response as externally unknown so the same retry key can reconcile it', async () => {
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
