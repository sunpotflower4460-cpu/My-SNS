import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST } from './route'

// Route-level smoke test: confirms the fail-closed env gate and signature
// verification are actually wired up on this handler (not just correct in
// isolation — verify-line-signature.test.ts already covers the crypto
// itself). Does not exercise the authorized path — that needs a real
// Supabase service client and a resolvable workspace.

describe('POST /api/webhooks/line', () => {
  const saved: string | undefined = process.env.LINE_CHANNEL_SECRET

  beforeEach(() => {
    delete process.env.LINE_CHANNEL_SECRET
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.LINE_CHANNEL_SECRET
    else process.env.LINE_CHANNEL_SECRET = saved
  })

  it('fails closed with 503 when LINE_CHANNEL_SECRET is unset', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/line', { method: 'POST', body: '{}' }),
    )
    expect(response.status).toBe(503)
  })

  it('rejects with 401 when the signature is missing', async () => {
    process.env.LINE_CHANNEL_SECRET = 'channel-secret'
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/line', { method: 'POST', body: '{}' }),
    )
    expect(response.status).toBe(401)
  })

  it('rejects with 401 when the signature does not match the body', async () => {
    process.env.LINE_CHANNEL_SECRET = 'channel-secret'
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/line', {
        method: 'POST',
        body: '{"events":[]}',
        headers: { 'x-line-signature': 'not-a-real-signature' },
      }),
    )
    expect(response.status).toBe(401)
  })
})
