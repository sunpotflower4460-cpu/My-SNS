import { afterEach, describe, expect, it, vi } from 'vitest'
import { YouTubeConnectorAdapter, mapCommentThreads, type CommentThreadsResponse } from './youtube-connector'

function mockResponse(init: { ok: boolean; status: number; body?: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers(),
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
})
