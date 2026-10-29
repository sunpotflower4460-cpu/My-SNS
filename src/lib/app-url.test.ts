import { describe, expect, it } from 'vitest'
import { detectAppUrlMismatch } from './app-url'

describe('detectAppUrlMismatch', () => {
  it('is null when unset or equal (ignoring trailing slashes and whitespace)', () => {
    expect(detectAppUrlMismatch(undefined, 'https://a.example')).toBeNull()
    expect(detectAppUrlMismatch('', 'https://a.example')).toBeNull()
    expect(detectAppUrlMismatch(' https://a.example/ ', 'https://a.example')).toBeNull()
    expect(detectAppUrlMismatch('https://a.example', undefined)).toBeNull()
  })

  it('reports a different host, including localhost vs 127.0.0.1', () => {
    expect(detectAppUrlMismatch('http://127.0.0.1:3000', 'http://localhost:3000')).toEqual({
      configured: 'http://127.0.0.1:3000',
      current: 'http://localhost:3000',
    })
    expect(detectAppUrlMismatch('http://127.0.0.1:3000', 'https://app.example')).not.toBeNull()
  })
})
