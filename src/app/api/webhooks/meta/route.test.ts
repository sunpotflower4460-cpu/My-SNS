import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET, POST } from './route'

// Route-level smoke test: confirms the fail-closed env gate and signature
// verification are actually wired up on this handler (not just correct in
// isolation — verify-meta-signature.test.ts already covers the crypto
// itself). Does not exercise the authorized path — that needs a real
// Supabase service client and a resolvable workspace.

describe('webhooks/meta', () => {
  const savedToken: string | undefined = process.env.META_WEBHOOK_VERIFY_TOKEN
  const savedSecret: string | undefined = process.env.META_APP_SECRET

  beforeEach(() => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN
    delete process.env.META_APP_SECRET
  })

  afterEach(() => {
    if (savedToken === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN
    else process.env.META_WEBHOOK_VERIFY_TOKEN = savedToken
    if (savedSecret === undefined) delete process.env.META_APP_SECRET
    else process.env.META_APP_SECRET = savedSecret
  })

  describe('GET (subscription verification handshake)', () => {
    it('fails closed with 503 when META_WEBHOOK_VERIFY_TOKEN is unset', async () => {
      const response = await GET(new NextRequest('http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=y'))
      expect(response.status).toBe(503)
    })

    it('rejects with 403 when the verify_token does not match', async () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'correct-token'
      const response = await GET(
        new NextRequest('http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=y'),
      )
      expect(response.status).toBe(403)
    })

    it('echoes the challenge with 200 when the verify_token matches', async () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'correct-token'
      const response = await GET(
        new NextRequest('http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=correct-token&hub.challenge=echo-me'),
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('echo-me')
    })
  })

  describe('POST (event delivery)', () => {
    it('fails closed with 503 when META_APP_SECRET is unset', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/webhooks/meta', { method: 'POST', body: '{}' }),
      )
      expect(response.status).toBe(503)
    })

    it('rejects with 401 when the signature is missing', async () => {
      process.env.META_APP_SECRET = 'app-secret'
      const response = await POST(
        new NextRequest('http://localhost/api/webhooks/meta', { method: 'POST', body: '{}' }),
      )
      expect(response.status).toBe(401)
    })

    it('rejects with 401 when the signature does not match the body', async () => {
      process.env.META_APP_SECRET = 'app-secret'
      const response = await POST(
        new NextRequest('http://localhost/api/webhooks/meta', {
          method: 'POST',
          body: '{"entry":[]}',
          headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
        }),
      )
      expect(response.status).toBe(401)
    })
  })
})
