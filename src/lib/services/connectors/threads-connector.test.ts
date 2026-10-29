import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishRequest } from '../interfaces'
import { ThreadsConnectorAdapter } from './threads-connector'

function response(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

const BASE_REQUEST: PublishRequest = {
  platform: 'threads',
  accessToken: 'token',
  externalAccountId: 'threads-user',
  body: 'post text',
  hashtags: [],
  metadata: {},
}

describe('ThreadsConnectorAdapter.publish', () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl
  })

  it('publishes a text-only post (no media required, unlike Instagram)', async () => {
    const fetchMock = vi
      .fn()
      // container creation
      .mockResolvedValueOnce(response(true, 200, { id: 'creation-1' }))
      // irreversible threads_publish success
      .mockResolvedValueOnce(response(true, 200, { id: 'post-1' }))
      // optional permalink lookup succeeds
      .mockResolvedValueOnce(response(true, 200, { permalink: 'https://www.threads.net/@creator/post/post-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new ThreadsConnectorAdapter().publish(BASE_REQUEST)

    expect(result).toEqual({ externalPostId: 'post-1', externalUrl: 'https://www.threads.net/@creator/post/post-1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const creationBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams
    expect(creationBody.get('media_type')).toBe('TEXT')
  })

  it('returns confirmed success when threads_publish succeeded but permalink enrichment fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { id: 'creation-1' }))
      .mockResolvedValueOnce(response(true, 200, { id: 'post-1' }))
      .mockResolvedValueOnce(response(false, 500, { error: { message: 'temporary lookup failure' } }))
    vi.stubGlobal('fetch', fetchMock)

    const request: PublishRequest = {
      ...BASE_REQUEST,
      metadata: {
        mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/image.jpg?token=abc',
        mediaType: 'image',
      },
    }

    const result = await new ThreadsConnectorAdapter().publish(request)

    expect(result).toEqual({ externalPostId: 'post-1', externalUrl: undefined })
    const creationBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams
    expect(creationBody.get('media_type')).toBe('IMAGE')
  })

  it('waits for a video container to become FINISHED before threads_publish', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { id: 'video-container' }))
      .mockResolvedValueOnce(response(true, 200, { status: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(response(true, 200, { status: 'FINISHED' }))
      .mockResolvedValueOnce(response(true, 200, { id: 'video-post' }))
      .mockResolvedValueOnce(response(true, 200, { permalink: 'https://www.threads.net/@creator/post/video-post' }))
    vi.stubGlobal('fetch', fetchMock)

    const publishPromise = new ThreadsConnectorAdapter().publish({
      ...BASE_REQUEST,
      metadata: {
        mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
        mediaType: 'video',
      },
    })

    await vi.runAllTimersAsync()
    const result = await publishPromise

    expect(result.externalPostId).toBe('video-post')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    const publishCallUrl = fetchMock.mock.calls[3][0] as string
    expect(publishCallUrl).toContain('/threads_publish')
  })

  it('classifies a lost threads_publish response as EXTERNAL_RESULT_UNKNOWN to block automatic retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { id: 'creation-1' }))
      .mockRejectedValueOnce(new Error('network reset'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new ThreadsConnectorAdapter().publish(BASE_REQUEST)).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
  })

  it('throws when the connected account id is missing', async () => {
    await expect(
      new ThreadsConnectorAdapter().publish({ ...BASE_REQUEST, externalAccountId: undefined }),
    ).rejects.toThrow(/connected account id/)
  })
})

describe('ThreadsConnectorAdapter.connect / refreshAccessToken', () => {
  const previousClientId = process.env.THREADS_CLIENT_ID
  const previousClientSecret = process.env.THREADS_CLIENT_SECRET

  beforeEach(() => {
    process.env.THREADS_CLIENT_ID = 'client-id'
    process.env.THREADS_CLIENT_SECRET = 'client-secret'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousClientId === undefined) delete process.env.THREADS_CLIENT_ID
    else process.env.THREADS_CLIENT_ID = previousClientId
    if (previousClientSecret === undefined) delete process.env.THREADS_CLIENT_SECRET
    else process.env.THREADS_CLIENT_SECRET = previousClientSecret
  })

  it('exchanges the auth code for a long-lived token and stores it as its own refresh token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { access_token: 'short-lived', user_id: 'threads-user' }))
      .mockResolvedValueOnce(response(true, 200, { access_token: 'long-lived', token_type: 'bearer', expires_in: 5184000 }))
      .mockResolvedValueOnce(response(true, 200, { id: 'threads-user', username: 'creator' }))
    vi.stubGlobal('fetch', fetchMock)

    const account = await new ThreadsConnectorAdapter().connect(
      'threads',
      'auth-code',
      { redirectUri: 'https://app.example.com/api/social/threads/callback' },
    )

    expect(account.accessToken).toBe('long-lived')
    expect(account.refreshToken).toBe('long-lived')
    expect(account.externalAccountId).toBe('threads-user')
    expect(account.handle).toBe('creator')
    expect(account.expiresAt).toBeDefined()
  })

  it('refreshes using the current access token and returns a new self-referential refresh token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { access_token: 'refreshed-token', token_type: 'bearer', expires_in: 5184000 }))
    vi.stubGlobal('fetch', fetchMock)

    const refreshed = await new ThreadsConnectorAdapter().refreshAccessToken('threads', 'long-lived')

    expect(refreshed.accessToken).toBe('refreshed-token')
    expect(refreshed.refreshToken).toBe('refreshed-token')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('access_token=long-lived')
  })

  it('throws when THREADS_CLIENT_ID is not configured', async () => {
    delete process.env.THREADS_CLIENT_ID
    await expect(
      new ThreadsConnectorAdapter().connect('threads', 'auth-code', { redirectUri: 'https://app.example.com/callback' }),
    ).rejects.toThrow(/THREADS_CLIENT_ID/)
  })
})
