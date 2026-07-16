import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { decryptToken, encryptToken, isTokenEncryptionConfigured } from './token-cipher'

describe('token-cipher', () => {
  beforeEach(() => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  })

  it('round-trips a token through encrypt/decrypt', () => {
    const plaintext = 'a-very-secret-oauth-token'
    const encrypted = encryptToken(plaintext)

    expect(encrypted).not.toContain(plaintext)
    expect(decryptToken(encrypted)).toBe(plaintext)
  })

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const first = encryptToken('same-token')
    const second = encryptToken('same-token')

    expect(first).not.toBe(second)
  })

  it('reports unconfigured when the key is missing', () => {
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY
    expect(isTokenEncryptionConfigured()).toBe(false)
    expect(() => encryptToken('x')).toThrow(/SOCIAL_TOKEN_ENCRYPTION_KEY/)
  })

  it('rejects a key that does not decode to 32 bytes', () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'too-short'
    expect(() => encryptToken('x')).toThrow(/32 bytes/)
  })
})
