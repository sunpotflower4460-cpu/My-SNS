import { describe, expect, it } from 'vitest'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce'

const BASE64URL = /^[A-Za-z0-9_-]+$/

describe('pkce helpers', () => {
  it('generates base64url-safe state and verifiers with no padding', () => {
    expect(generateState()).toMatch(BASE64URL)
    expect(generateCodeVerifier()).toMatch(BASE64URL)
  })

  it('derives a deterministic, distinct challenge from a verifier', () => {
    const verifier = generateCodeVerifier()
    const challenge = deriveCodeChallenge(verifier)

    expect(challenge).toMatch(BASE64URL)
    expect(challenge).not.toBe(verifier)
    expect(deriveCodeChallenge(verifier)).toBe(challenge)
  })

  it('produces different verifiers on each call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier())
  })
})
