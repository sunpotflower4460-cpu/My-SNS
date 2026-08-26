import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TIKTOK_PENDING_ERROR_PREFIX,
  checkTikTokPublishStatus,
  parseTikTokPendingPublishId,
} from './tiktok-connector'

function mockResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
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
