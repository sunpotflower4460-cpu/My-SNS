import { describe, expect, it } from 'vitest'
import { derivePublishMode, getPublishingStrategy, isManualCopyChannel } from './config'

describe('publishing strategy', () => {
  it('fails safe to zero-cost when unset or unknown', () => {
    expect(getPublishingStrategy(undefined)).toBe('zero-cost')
    expect(getPublishingStrategy('')).toBe('zero-cost')
    expect(getPublishingStrategy('something-else')).toBe('zero-cost')
    expect(getPublishingStrategy('api-first')).toBe('api-first')
  })

  it('makes third-party publishing manual in zero-cost mode', () => {
    for (const channel of ['x', 'instagram', 'youtube', 'tiktok', 'note', 'threads', 'facebook', 'line'] as const) {
      expect(derivePublishMode(channel, 'zero-cost')).toBe('manual')
    }
    expect(derivePublishMode('website', 'zero-cost')).toBe('owned')
  })

  it('preserves the existing connector strategy as an explicit api-first opt-in', () => {
    expect(derivePublishMode('x', 'api-first')).toBe('auto')
    expect(derivePublishMode('instagram', 'api-first')).toBe('auto')
    expect(derivePublishMode('youtube', 'api-first')).toBe('assisted')
    expect(derivePublishMode('tiktok', 'api-first')).toBe('draft')
    expect(derivePublishMode('note', 'api-first')).toBe('manual')
    expect(derivePublishMode('threads', 'api-first')).toBe('assisted')
    expect(derivePublishMode('facebook', 'api-first')).toBe('assisted')
    expect(derivePublishMode('website', 'api-first')).toBe('owned')
  })

  it('keeps the static manual-copy metadata for channels that are always copy based', () => {
    expect(isManualCopyChannel('note')).toBe(true)
    expect(isManualCopyChannel('x')).toBe(false)
  })
})
