import { afterEach, describe, expect, it, vi } from 'vitest'
import { YouTubeConnectorAdapter, mapCommentThreads, type CommentThreadsResponse } from './youtube-connector'

function mockResponse(init: { ok: boolean; status: number; body?: unknown; headers?: Record<string, string>; streamBody?: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers(init.headers ?? {}),
    body: init.streamBody ?? null,
    json: async () => init.body,
    text: async () => JSON.stringify(init.body ?? {}),
  } as unknown as Response
}

describe('mapCommentThreads', () => {
  it('maps a comment thread into a comment event', () => {
    const payload: CommentThreadsResponse = {
      items: [
        {
          snippet: {
            topLevelComment: {
              id: 'comment-1',
              snippet: {
                authorDisplayName: 'A Fan',
                authorProfileImageUrl: 'https://example.com/avatar.png',
                textDisplay: 'Great video!',
                publishedAt: '2026-01-01T00:00:00Z',
              },
            },
          },
        },
      ],
    }

    const events = mapCommentThreads(payload)

    expect(events).toEqual([
      {
        platform: 'youtube',
        kind: 'comment',
        externalId: 'comment-1',
        authorHandle: 'A Fan',
        authorAvatarUrl: 'https://example.com/avatar.png',
        text: 'Great video!',
        receivedAt: '2026-01-01T00:00:00Z',
      },
    ])
  })

  it('falls back to "unknown" author and empty items array gracefully', () => {
    expect(mapCommentThreads({})).toEqual([])
    expect(
      mapCommentThreads({
        items: [{ snippet: { topLevelComment: { id: 'c2', snippet: {} } } }],
      })[0].authorHandle,
    ).toBe('unknown')
  })
})

describe('YouTubeConnectorAdapter credential refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.YOUTUBE_CLIENT_ID
    delete process.env.YOUTUBE_CLIENT_SECRET
  })

  it('persists the refreshed access token without requiring a channel lookup', async () => {
    process.env.YOUTUBE_CLIENT_ID = 'client'
    process.env.YOUTUBE_CLIENT_SECRET = 'secret'
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: {
          access_token: 'new-access',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/youtube.upload',
          token_type: 'Bearer',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const refreshed = await new YouTubeConnectorAdapter().refreshAccessToken('youtube', 'old-refresh')

    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.refreshToken).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('YouTubeConnectorAdapter.publish result safety', () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl
  })

  it('marks a provider 5xx after video bytes are sent as externally unknown', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({ ok: true, status: 200, headers: { location: 'https://upload.youtube.test/session' } }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          headers: { 'content-type': 'video/mp4' },
          streamBody: { fake: 'stream' },
        }),
      )
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 503, body: { error: 'temporary' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new YouTubeConnectorAdapter().publish({
        platform: 'youtube',
        accessToken: 'token',
        title: 'Video',
        body: 'Description',
        hashtags: [],
        metadata: {
          mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
        },
      }),
    ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
  })

  it('marks a lost final upload response as externally unknown', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({ ok: true, status: 200, headers: { location: 'https://upload.youtube.test/session' } }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          headers: { 'content-type': 'video/mp4' },
          streamBody: { fake: 'stream' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new YouTubeConnectorAdapter().publish({
        platform: 'youtube',
        accessToken: 'token',
        body: 'Description',
        hashtags: [],
        metadata: {
          mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
        },
      }),
    ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
  })
})

describe('YouTubeConnectorAdapter fetch methods', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchInbox queries allThreadsRelatedToChannelId using the connected channel id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, body: { items: [] } }))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new YouTubeConnectorAdapter()
    await adapter.fetchInbox({ platform: 'youtube', accessToken: 'token', externalAccountId: 'channel-1' })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('allThreadsRelatedToChannelId=channel-1')
  })

  it('fetchInbox fails closed without an externalAccountId, without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new YouTubeConnectorAdapter()
    await expect(adapter.fetchInbox({ platform: 'youtube', accessToken: 'token' })).rejects.toThrow(/channel id/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetchComments queries by videoId (postId)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, body: { items: [] } }))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new YouTubeConnectorAdapter()
    await adapter.fetchComments({ platform: 'youtube', accessToken: 'token', postId: 'video-1' })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('videoId=video-1')
  })

  it('surfaces a non-ok comment fetch as an error rather than an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 403, body: { error: 'commentsDisabled' } })))

    const adapter = new YouTubeConnectorAdapter()
    await expect(adapter.fetchComments({ platform: 'youtube', accessToken: 'token', postId: 'video-1' })).rejects.toThrow(/403/)
  })

  it('fetchMentions and fetchMessages fail closed — YouTube has no such API', async () => {
    const adapter = new YouTubeConnectorAdapter()
    await expect(adapter.fetchMentions()).rejects.toThrow(/mentions/i)
    await expect(adapter.fetchMessages()).rejects.toThrow(/direct-message/i)
  })

  it('fetchMetrics maps videos.list statistics into PostMetrics (PR7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ ok: true, status: 200, body: { items: [{ statistics: { viewCount: '1000', likeCount: '50', commentCount: '7' } }] } }),
      ),
    )

    const metrics = await new YouTubeConnectorAdapter().fetchMetrics({ platform: 'youtube', accessToken: 'token', postId: 'video-1' })

    expect(metrics).toEqual({ views: 1000, likes: 50, comments: 7 })
  })

  it('fetchMetrics throws when YouTube returns no matching video rather than defaulting to zeros', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, body: { items: [] } })))

    await expect(new YouTubeConnectorAdapter().fetchMetrics({ platform: 'youtube', accessToken: 'token', postId: 'missing' })).rejects.toThrow(/no statistics/)
  })
})
