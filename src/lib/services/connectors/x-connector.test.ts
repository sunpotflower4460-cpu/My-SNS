import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublishRequest } from '../interfaces'
import { buildFirstTweetText, postTweetWithRetry } from './x-connector'

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

  it('surfaces a non-429 failure without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500, body: { error: 'server error' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(postTweetWithRetry('hi', undefined, 'token')).rejects.toThrow(/500/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
