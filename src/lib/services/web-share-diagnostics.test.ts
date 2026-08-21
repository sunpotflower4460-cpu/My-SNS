import { describe, expect, it } from 'vitest'
import { chooseWebShareRecommendation, describeWebShareFailure } from './web-share-diagnostics'

describe('web share diagnostics', () => {
  it('prefers file sharing only when the secure Web Share path supports files', () => {
    expect(chooseWebShareRecommendation({
      secureContext: true,
      shareSupported: true,
      policyState: 'supported',
      textShareState: 'supported',
      fileShareState: 'supported',
    })).toBe('file-share')
  })

  it('falls back to text sharing when file sharing is unavailable', () => {
    expect(chooseWebShareRecommendation({
      secureContext: true,
      shareSupported: true,
      policyState: 'unknown',
      textShareState: 'supported',
      fileShareState: 'unsupported',
    })).toBe('text-share')
  })

  it('requires the traditional fallback outside a secure context', () => {
    expect(chooseWebShareRecommendation({
      secureContext: false,
      shareSupported: true,
      policyState: 'supported',
      textShareState: 'supported',
      fileShareState: 'supported',
    })).toBe('fallback')
  })

  it('requires the fallback when Permissions Policy blocks web-share', () => {
    expect(chooseWebShareRecommendation({
      secureContext: true,
      shareSupported: true,
      policyState: 'unsupported',
      textShareState: 'unknown',
      fileShareState: 'unknown',
    })).toBe('fallback')
  })

  it('explains transient activation and permission failures', () => {
    const failure = describeWebShareFailure({ name: 'NotAllowedError' }, true)
    expect(failure.code).toBe('not-allowed')
    expect(failure.message).toContain('タップ')
  })

  it('does not assume AbortError always means a user cancellation', () => {
    const failure = describeWebShareFailure({ name: 'AbortError' }, false)
    expect(failure.code).toBe('abort')
    expect(failure.message).toContain('共有先')
  })

  it('gives a file-specific fallback for invalid share data', () => {
    const failure = describeWebShareFailure({ name: 'TypeError' }, true)
    expect(failure.code).toBe('invalid-data')
    expect(failure.message).toContain('画像・動画')
  })
})
