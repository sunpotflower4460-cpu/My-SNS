import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TIKTOK_PENDING_ERROR_PREFIX,
  TikTokConnectorAdapter,
  checkTikTokPublishStatus,
  parseTikTokPendingPublishId,
} from './tiktok-connector'

function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body ?? {}),
  } as unknown as Response
}

describe('TikTok pending publish reconciliation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips the durable publish id from a timeout error message', () => {
    const message = `${TIKTOK_PENDING_ERROR_PREFIX}publish-123:TikTok is still processing this post.`
    expect(parseTikTokPendingPublishId(message)).toBe('publish-123')
    expect(parseTikTokPendingPublishId('TikTok post failed')).toBeNull()
  })

  it('reports processing without creating another publish operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ data: { status: 'PROCESSING_UPLOAD' }, error: { code: 'ok', message: '' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkTikTokPublishStatus('token', 'publish-123')).resolves.toEqual({ state: 'processing' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the completed TikTok post id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockResponse({
        data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['post-456'] },
        error: { code: 'ok', message: '' },
      }),
    ))

    await expect(checkTikTokPublishStatus('token', 'publish-123')).resolves.toEqual({ state: 'complete', postId: 'post-456' })
  })

  it('distinguishes a provider-confirmed failure from an in-progress operation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockResponse({ data: { status: 'FAILED', fail_reason: 'video rejected' }, error: { code: 'ok', message: '' } }),
    ))

    await expect(checkTikTokPublishStatus('token', 'publish-123')).resolves.toEqual({ state: 'failed', reason: 'video rejected' })
  })
})

describe('TikTokConnectorAdapter credential refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TIKTOK_CLIENT_KEY
    delete process.env.TIKTOK_CLIENT_SECRET
  })

  it('returns a rotated refresh token without making a creator profile request', async () => {
    process.env.TIKTOK_CLIENT_KEY = 'client'
    process.env.TIKTOK_CLIENT_SECRET = 'secret'
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: 'new-access',
        expires_in: 7200,
        refresh_token: 'new-refresh',
        scope: 'user.info.basic,video.publish',
        open_id: 'creator-id',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const refreshed = await new TikTokConnectorAdapter().refreshAccessToken('tiktok', 'old-refresh')

    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.refreshToken).toBe('new-refresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('TikTokConnectorAdapter publish initialization safety', () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl
  })

  it('marks a 5xx from irreversible publish init as externally unknown', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          data: { max_video_post_duration_sec: 600, privacy_level_options: ['SELF_ONLY'] },
          error: { code: 'ok', message: '' },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse(
          { error: { code: 'server_error', message: 'temporary' } },
          { ok: false, status: 503 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new TikTokConnectorAdapter().publish({
        platform: 'tiktok',
        accessToken: 'token',
        body: 'Caption',
        hashtags: [],
        metadata: {
          mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
        },
      }),
    ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
  })

  it('marks a lost publish-init response as externally unknown', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          data: { max_video_post_duration_sec: 600, privacy_level_options: ['SELF_ONLY'] },
          error: { code: 'ok', message: '' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new TikTokConnectorAdapter().publish({
        platform: 'tiktok',
        accessToken: 'token',
        body: 'Caption',
        hashtags: [],
        metadata: {
          mediaUrl: 'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
        },
      }),
    ).rejects.toThrow(/EXTERNAL_RESULT_UNKNOWN/)
  })
})
