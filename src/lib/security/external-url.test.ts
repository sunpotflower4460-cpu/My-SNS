import { describe, expect, it } from 'vitest'
import { normalizeExternalHttpUrl } from './external-url'

describe('normalizeExternalHttpUrl', () => {
  it('keeps fully qualified http and https URLs', () => {
    expect(normalizeExternalHttpUrl('https://example.com/post/123')).toBe('https://example.com/post/123')
    expect(normalizeExternalHttpUrl(' http://example.com/post ')).toBe('http://example.com/post')
  })

  it('rejects executable, local, and malformed URL schemes', () => {
    expect(normalizeExternalHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeExternalHttpUrl('data:text/html,hello')).toBeUndefined()
    expect(normalizeExternalHttpUrl('file:///tmp/post')).toBeUndefined()
    expect(normalizeExternalHttpUrl('not a url')).toBeUndefined()
  })

  it('treats blank values as an intentionally omitted URL', () => {
    expect(normalizeExternalHttpUrl('')).toBeUndefined()
    expect(normalizeExternalHttpUrl('   ')).toBeUndefined()
    expect(normalizeExternalHttpUrl(undefined)).toBeUndefined()
  })
})
