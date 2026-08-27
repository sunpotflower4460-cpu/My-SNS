import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublishRequest } from '../interfaces'
import { buildFirstTweetText, postTweetWithRetry, XConnectorAdapter } from './x-connector'

function mockResponse(init: { ok: boolean; status: number; headers?: Record<string, string>; body?: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers(init.headers ?? {}),
    json: async () => init.body,
    text: async () => JSON.stringify(init.body ?? {}),
  } as unknown as Response
}

const baseRequest: PublishRequest = {
  platform: 'x',
  accessToken: 'token',
  body: 'Just shipped a new arrangement.',
  hashtags: [],
  metadata: {},
}

describe('buildFirstTweetText', () => {
  it('includes the body, CTA, and hashtags — the CTA is not silently dropped', () => {
    const text = buildFirstTweetText({
      ...baseRequest,
      cta: 'Listen now: example.com/track',
      hashtags: ['newmusic', 'studio'],
    })

    expect(text).toContain('Just shipped a new arrangement.')
    expect(text).toContain('Listen now: example.com/track')
    expect(text).toContain('#newmusic')
    expect(text).toContain('#studio')
  })

  it('omits the CTA and hashtag suffixes entirely when absent, rather than leaving stray whitespace', () => {
    expect(buildFirstTweetText(baseRequest)).toBe('Just shipped a new arrangement.')
  })
})

describe('postTweetWithRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns immediately on success without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, body: { data: { id: '1', text: 'hi' } } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await postTweetWithRetry('hi', undefined, 'token')

    expect(result.data.id).toBe('1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries exactly once after a 429 with a short rate-limit-reset window, then succeeds', async () => {
    vi.useFakeTimers()
    const resetSeconds = Math.ceil((Date.now() + 1000) / 1000)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 429, headers: { 'x-rate-limit-reset': String(resetSeconds) } }))
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, body: { data: { id: '2', text: 'hi' } } }))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = postTweetWithRetry('hi', undefined, 'token')
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.data.id).toBe('2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never retries a second time — two consecutive 429s throw a rate limit error', async () => {
    vi.useFakeTimers()
    const resetSeconds = Math.ceil((Date.now() + 1000) / 1000)
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 429, headers: { 'x-rate-limit-reset': String(resetSeconds) } }))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = postTweetWithRetry('hi', undefined, 'token')
    const assertion = expect(resultPromise).rejects.toThrow(/rate limit/i)
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not block on a reset window longer than the retry cap — throws immediately', async () => {
    const resetSeconds = Math.ceil((Date.now() + 60_000) / 1000)
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 429, headers: { 'x-rate-limit-reset': String(resetSeconds) } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(postTweetWithRetry('hi', undefined, 'token')).rejects.toThrow(/rate limit/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a provider 5xx after the create POST as externally unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500, body: { error: 'server error' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(postTweetWithRetry('hi', undefined, 'token')).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a lost network response as externally unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(postTweetWithRetry('hi', undefined, 'token')).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
  })
})

describe('XConnectorAdapter credential refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.X_CLIENT_ID
    delete process.env.X_CLIENT_SECRET
  })

  it('returns the rotated token immediately without a profile lookup', async () => {
    process.env.X_CLIENT_ID = 'client'
    process.env.X_CLIENT_SECRET = 'secret'
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: {
          token_type: 'bearer',
          expires_in: 7200,
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          scope: 'tweet.read tweet.write offline.access',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const refreshed = await new XConnectorAdapter().refreshAccessToken('x', 'old-refresh')

    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.refreshToken).toBe('new-refresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('XConnectorAdapter.publish thread safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks a later thread failure as partial external success after the first tweet exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, body: { data: { id: 'first', text: 'first' } } }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 500, body: { error: 'server error' } }))
    vi.stubGlobal('fetch', fetchMock)

    const request: PublishRequest = {
      ...baseRequest,
      handle: 'artist',
      metadata: { thread: ['second tweet'] },
    }

    await expect(new XConnectorAdapter().publish(request)).rejects.toThrow(/PARTIAL_EXTERNAL_SUCCESS/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('XConnectorAdapter.fetchMetrics (PR7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps public_metrics into PostMetrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: { data: { public_metrics: { like_count: 12, reply_count: 3, retweet_count: 5, impression_count: 400 } } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const metrics = await new XConnectorAdapter().fetchMetrics({ platform: 'x', accessToken: 'token', postId: '123' })

    expect(metrics).toEqual({ views: 400, likes: 12, comments: 3, shares: 5 })
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/tweets/123')
    expect(calledUrl).toContain('tweet.fields=public_metrics')
  })

  it('surfaces a lookup failure rather than returning empty metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 404, body: { title: 'Not Found' } })))

    await expect(new XConnectorAdapter().fetchMetrics({ platform: 'x', accessToken: 'token', postId: 'missing' })).rejects.toThrow(/404/)
  })
})
