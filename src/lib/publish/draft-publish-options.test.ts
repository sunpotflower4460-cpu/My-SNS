import { describe, expect, it } from 'vitest'
import { mergeDraftPublishOptions, parseDraftPublishOptions } from './draft-publish-options'

describe('draft publish options', () => {
  it('ignores non-uuid and text-idea fields', () => {
    expect(parseDraftPublishOptions({
      thumbnailAssetId: 'not-a-uuid',
      thumbnailTextIdeas: ['ignored'],
      socialAccountId: '11111111-1111-4111-8111-111111111111',
    })).toEqual({
      socialAccountId: '11111111-1111-4111-8111-111111111111',
      thumbnailAssetId: undefined,
      coverAssetId: undefined,
      eyecatchAssetId: undefined,
      isShort: undefined,
      privacyStatus: undefined,
      coverTimestampMs: undefined,
    })
  })

  it('clears a field when merged with undefined', () => {
    const merged = mergeDraftPublishOptions(
      { thumbnailAssetId: '11111111-1111-4111-8111-111111111111', isShort: true },
      { isShort: undefined, thumbnailAssetId: undefined },
    )
    expect(merged.thumbnailAssetId).toBeUndefined()
    expect(merged.isShort).toBeUndefined()
  })

  it('keeps every option the patch does not mention', () => {
    const metadata = {
      thumbnailAssetId: '11111111-1111-4111-8111-111111111111',
      coverAssetId: '22222222-2222-4222-8222-222222222222',
      isShort: true,
      note: 'kept',
    }
    const merged = mergeDraftPublishOptions(metadata, { socialAccountId: '33333333-3333-4333-8333-333333333333' })
    expect(merged).toEqual({ ...metadata, socialAccountId: '33333333-3333-4333-8333-333333333333' })
  })

  it('removes only the keys that are present as undefined', () => {
    const merged = mergeDraftPublishOptions(
      { thumbnailAssetId: '11111111-1111-4111-8111-111111111111', isShort: true },
      { thumbnailAssetId: undefined },
    )
    expect(merged.thumbnailAssetId).toBeUndefined()
    expect(merged.isShort).toBe(true)
  })
})
