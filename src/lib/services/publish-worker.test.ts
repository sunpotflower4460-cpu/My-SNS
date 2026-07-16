import { describe, expect, it } from 'vitest'
import { classifyFailure } from './publish-worker'

describe('classifyFailure', () => {
  it('classifies the stub connector message as unavailable', () => {
    expect(classifyFailure('Publishing for x is unavailable until the reviewed platform connector phase.')).toBe('unavailable')
  })

  it('classifies auth-shaped errors', () => {
    expect(classifyFailure('Token refresh failed: unauthorized')).toBe('auth')
  })

  it('classifies rate limit errors', () => {
    expect(classifyFailure('Request failed with status 429')).toBe('ratelimit')
  })

  it('classifies network errors', () => {
    expect(classifyFailure('fetch failed: network timeout')).toBe('network')
  })

  it('falls back to validation for anything unrecognized', () => {
    expect(classifyFailure('Media file exceeds the platform size limit')).toBe('validation')
  })
})
