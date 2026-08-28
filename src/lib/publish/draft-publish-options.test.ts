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
})
