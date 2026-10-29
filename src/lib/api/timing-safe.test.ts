import { describe, expect, it } from 'vitest'
import { isBearerAuthorized, timingSafeStringEqual } from './timing-safe'

describe('timingSafeStringEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeStringEqual('secret', 'secret')).toBe(true)
  })

  it('rejects different content, different length, and missing values', () => {
    expect(timingSafeStringEqual('secreT', 'secret')).toBe(false)
    expect(timingSafeStringEqual('secret1', 'secret')).toBe(false)
    expect(timingSafeStringEqual('', 'secret')).toBe(false)
    expect(timingSafeStringEqual(null, 'secret')).toBe(false)
    expect(timingSafeStringEqual(undefined, 'secret')).toBe(false)
  })

  it('handles multibyte strings without throwing on byte-length mismatch', () => {
    expect(timingSafeStringEqual('あ', 'a')).toBe(false)
    expect(timingSafeStringEqual('あい', 'あい')).toBe(true)
  })
})

describe('isBearerAuthorized', () => {
  it('requires the exact Bearer scheme and secret', () => {
    expect(isBearerAuthorized('Bearer abc', 'abc')).toBe(true)
    expect(isBearerAuthorized('bearer abc', 'abc')).toBe(false)
    expect(isBearerAuthorized('abc', 'abc')).toBe(false)
    expect(isBearerAuthorized(null, 'abc')).toBe(false)
  })
})
