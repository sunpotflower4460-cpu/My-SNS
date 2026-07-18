import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyLineSignature } from './verify-line-signature'

const CHANNEL_SECRET = 'test-channel-secret'

function sign(body: string, secret = CHANNEL_SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('verifyLineSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify({ destination: 'Uabc', events: [] })
    expect(verifyLineSignature(body, sign(body), CHANNEL_SECRET)).toBe(true)
  })

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify({ destination: 'Uabc', events: [] })
    expect(verifyLineSignature(body, sign(body, 'wrong-secret'), CHANNEL_SECRET)).toBe(false)
  })

  it('rejects a body that was tampered with after signing', () => {
    const originalBody = JSON.stringify({ destination: 'Uabc', events: [] })
    const signature = sign(originalBody)
    const tamperedBody = JSON.stringify({ destination: 'Uabc', events: [{ type: 'message' }] })
    expect(verifyLineSignature(tamperedBody, signature, CHANNEL_SECRET)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    expect(verifyLineSignature('{}', null, CHANNEL_SECRET)).toBe(false)
  })

  it('rejects a malformed (wrong-length) signature without throwing', () => {
    expect(verifyLineSignature('{}', 'not-a-real-signature', CHANNEL_SECRET)).toBe(false)
  })
})
