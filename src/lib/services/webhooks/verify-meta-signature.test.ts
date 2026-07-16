import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyMetaSignature } from './verify-meta-signature'

const APP_SECRET = 'test-app-secret'

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

describe('verifyMetaSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] })
    expect(verifyMetaSignature(body, sign(body), APP_SECRET)).toBe(true)
  })

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] })
    expect(verifyMetaSignature(body, sign(body, 'wrong-secret'), APP_SECRET)).toBe(false)
  })

  it('rejects a body that was tampered with after signing', () => {
    const originalBody = JSON.stringify({ object: 'instagram', entry: [] })
    const signature = sign(originalBody)
    const tamperedBody = JSON.stringify({ object: 'instagram', entry: [{ id: 'injected' }] })
    expect(verifyMetaSignature(tamperedBody, signature, APP_SECRET)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    expect(verifyMetaSignature('{}', null, APP_SECRET)).toBe(false)
  })

  it('rejects a signature header missing the sha256= prefix', () => {
    const body = '{}'
    const rawHex = createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')
    expect(verifyMetaSignature(body, rawHex, APP_SECRET)).toBe(false)
  })

  it('rejects a malformed (non-hex, wrong-length) signature without throwing', () => {
    expect(verifyMetaSignature('{}', 'sha256=not-valid-hex', APP_SECRET)).toBe(false)
  })
})
