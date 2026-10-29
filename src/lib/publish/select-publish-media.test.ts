import { describe, expect, it } from 'vitest'
import type { PublishAssetCandidate } from './select-publish-media'
import { selectPublishMedia } from './select-publish-media'

function asset(over: Partial<PublishAssetCandidate> & { id: string }): PublishAssetCandidate {
  return {
    storagePath: `${over.id}.bin`,
    type: 'video',
    publishingChannels: [],
    aspectRatio: null,
    mediaRole: 'source',
    ...over,
  }
}

const LAND_ID = '11111111-1111-4111-8111-111111111111'
const PORT_ID = '22222222-2222-4222-8222-222222222222'
const THUMB_ID = '33333333-3333-4333-8333-333333333333'
const COVER_ID = '44444444-4444-4444-8444-444444444444'
const MISSING_ID = '55555555-5555-4555-8555-555555555555'

describe('selectPublishMedia', () => {
  const landscape = asset({ id: LAND_ID, type: 'video', aspectRatio: '16:9', publishingChannels: ['youtube'] })
  const portrait = asset({ id: PORT_ID, type: 'video', aspectRatio: '9:16', publishingChannels: ['youtube', 'tiktok', 'instagram'] })
  const thumb = asset({ id: THUMB_ID, type: 'image', mediaRole: 'thumbnail', publishingChannels: ['youtube'] })
  const cover = asset({ id: COVER_ID, type: 'image', mediaRole: 'cover', publishingChannels: ['instagram'] })

  it('prefers 16:9 for YouTube long-form when both variants exist', () => {
    const result = selectPublishMedia({ assets: [landscape, portrait], channel: 'youtube' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.selection?.media.id).toBe(LAND_ID)
      expect(result.selection?.isShort).toBe(false)
    }
  })

  it('uses 9:16 and marks Shorts when that is requested', () => {
    const result = selectPublishMedia({
      assets: [landscape, portrait],
      channel: 'youtube',
      metadata: { isShort: true },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.selection?.media.id).toBe(PORT_ID)
      expect(result.selection?.isShort).toBe(true)
    }
  })

  it('fails closed when Shorts is requested without a 9:16 variant', () => {
    const result = selectPublishMedia({
      assets: [landscape],
      channel: 'youtube',
      metadata: { isShort: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/9:16/)
  })

  it('fails closed when TikTok only has a landscape master', () => {
    const result = selectPublishMedia({
      assets: [asset({ id: 'land2', type: 'video', aspectRatio: '16:9', publishingChannels: ['tiktok'] })],
      channel: 'tiktok',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/9:16/)
  })

  it('resolves a YouTube custom thumbnail from a real image asset, not text ideas', () => {
    const result = selectPublishMedia({
      assets: [landscape, thumb],
      channel: 'youtube',
      metadata: { thumbnailAssetId: THUMB_ID, thumbnailTextIdeas: ['ignored slogan'] },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.selection?.thumbnail?.id).toBe(THUMB_ID)
  })

  it('fails closed when a thumbnail id is requested but missing', () => {
    const result = selectPublishMedia({
      assets: [landscape],
      channel: 'youtube',
      metadata: { thumbnailAssetId: MISSING_ID },
    })
    expect(result.ok).toBe(false)
  })

  it('does not treat thumbnailTextIdeas as an attached thumbnail', () => {
    const result = selectPublishMedia({
      assets: [landscape],
      channel: 'youtube',
      metadata: { thumbnailTextIdeas: ['A bold title'] },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.selection?.thumbnail).toBeUndefined()
  })

  it('does not auto-attach a thumbnail when the draft did not select one', () => {
    const result = selectPublishMedia({
      assets: [landscape, thumb],
      channel: 'youtube',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.selection?.thumbnail).toBeUndefined()
  })

  it('does not fail TikTok just because a generated cover still exists', () => {
    const tiktokCover = asset({
      id: COVER_ID,
      type: 'image',
      mediaRole: 'cover',
      publishingChannels: ['instagram', 'tiktok', 'youtube'],
    })
    const result = selectPublishMedia({
      assets: [portrait, tiktokCover],
      channel: 'tiktok',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.selection?.cover).toBeUndefined()
  })

  it('rejects a TikTok custom cover image because the API cannot attach one', () => {
    const result = selectPublishMedia({
      assets: [portrait, cover],
      channel: 'tiktok',
      metadata: { coverAssetId: COVER_ID },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/カバー画像/)
  })

  it('attaches an Instagram Reel cover image when a still is chosen', () => {
    const result = selectPublishMedia({
      assets: [portrait, cover],
      channel: 'instagram',
      metadata: { coverAssetId: COVER_ID },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.selection?.media.id).toBe(PORT_ID)
      expect(result.selection?.cover?.id).toBe(COVER_ID)
    }
  })

  it('returns no media for note copy rather than inventing a file', () => {
    const result = selectPublishMedia({ assets: [], channel: 'note' })
    expect(result).toEqual({ ok: true, selection: null })
  })
})
