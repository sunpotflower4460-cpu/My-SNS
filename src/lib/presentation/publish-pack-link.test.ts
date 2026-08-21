import { describe, expect, it } from 'vitest'
import { buildPublishPackHref, publishPackChannelDomId, publishPackDomId } from './publish-pack-link'

describe('publish pack links', () => {
  it('builds a focused pack URL with an optional channel', () => {
    expect(buildPublishPackHref('seed-1', 'instagram')).toBe('/app/packs?seed=seed-1&channel=instagram')
    expect(buildPublishPackHref('seed-1')).toBe('/app/packs?seed=seed-1')
  })

  it('normalizes DOM ids without changing normal UUID-like ids', () => {
    expect(publishPackDomId('seed:1')).toBe('publish-pack-seed-1')
    expect(publishPackChannelDomId('seed:1', 'youtube')).toBe('publish-pack-seed-1-youtube')
  })
})
