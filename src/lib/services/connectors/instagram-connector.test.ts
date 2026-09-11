import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishRequest } from '../interfaces'
import { InstagramConnectorAdapter } from './instagram-connector'

function response(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('InstagramConnectorAdapter.publish', () => {
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

  it('returns confirmed success when media_publish succeeded but permalink enrichment fails', async () => {
    const fetchMock = vi
      .fn()
      // content_publishing_limit
      .mockResolvedValueOnce(response(true, 200, { data: [{ quota_usage: 1, config: { quota_total: 25 } }] }))
      // media creation
      .mockResolvedValueOnce(response(true, 200, { id: 'creation-1' }))
      // irreversible media_publish success
      .mockResolvedValueOnce(response(true, 200, { id: 'post-1' }))
      // optional permalink lookup fails
      .mockResolvedValueOnce(response(false, 500, { error: { message: 'temporary lookup failure' } }))
    vi.stubGlobal('fetch', fetchMock)

    const request: PublishRequest = {
      platform: 'instagram',
      accessToken: 'token',
      externalAccountId: 'ig-user',
      body: 'caption',
      hashtags: [],
      metadata: {
        mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/image.jpg?token=abc',
        mediaType: 'image',
      },
    }

    const result = await new InstagramConnectorAdapter().publish(request)

    expect(result).toEqual({ externalPostId: 'post-1', externalUrl: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('waits for a Reel container to become FINISHED before media_publish', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { data: [{ quota_usage: 1, config: { quota_total: 25 } }] }))
      .mockResolvedValueOnce(response(true, 200, { id: 'reel-container' }))
      .mockResolvedValueOnce(response(true, 200, { status_code: 'IN_PROGRESS', status: 'processing' }))
      .mockResolvedValueOnce(response(true, 200, { status_code: 'FINISHED', status: 'ready' }))
      .mockResolvedValueOnce(response(true, 200, { id: 'reel-post' }))
      .mockResolvedValueOnce(response(true, 200, { permalink: 'https://instagram.com/reel/example' }))
    vi.stubGlobal('fetch', fetchMock)

    const publishPromise = new InstagramConnectorAdapter().publish({
      platform: 'instagram',
      accessToken: 'token',
      externalAccountId: 'ig-user',
      body: 'reel caption',
      hashtags: [],
      metadata: {
        mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
        mediaType: 'video',
      },
    })

    await vi.runAllTimersAsync()
    const result = await publishPromise

    expect(result.externalPostId).toBe('reel-post')
    expect(fetchMock).toHaveBeenCalledTimes(6)
    const publishCallUrl = fetchMock.mock.calls[4][0] as string
    expect(publishCallUrl).toContain('/media_publish')
  })

  it('fails closed when Instagram publishing quota cannot be verified', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { data: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new InstagramConnectorAdapter().publish({
        platform: 'instagram',
        accessToken: 'token',
        externalAccountId: 'ig-user',
        body: 'caption',
        hashtags: [],
        metadata: {
          mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/image.jpg?token=abc',
          mediaType: 'image',
        },
      }),
    ).rejects.toThrow(/quota could not be verified/i)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('InstagramConnectorAdapter.sendMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replies to the given comment id, not a DM target', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(true, 200, { id: 'reply-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new InstagramConnectorAdapter().sendMessage({
      platform: 'instagram',
      accessToken: 'token',
      target: 'comment-123',
      text: 'ありがとうございます！',
    })

    expect(result).toEqual({ externalMessageId: 'reply-1' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url as string).toContain('/comment-123/replies')
    const body = init?.body as URLSearchParams
    expect(body.get('message')).toBe('ありがとうございます！')
  })

  it('surfaces a Graph API error instead of a false success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(false, 400, { error: { message: 'comment not found' } })))

    await expect(
      new InstagramConnectorAdapter().sendMessage({
        platform: 'instagram',
        accessToken: 'token',
        target: 'missing-comment',
        text: 'text',
      }),
    ).rejects.toThrow(/comment not found/)
  })
})
