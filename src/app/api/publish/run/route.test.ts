import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from './route'

// Route-level smoke test: confirms the CRON_SECRET gate is actually wired up
// on this handler (not just correct in isolation). Does not exercise the
// authorized path — that needs a real Supabase service client.

describe('GET /api/publish/run — CRON_SECRET gate', () => {
  const saved: string | undefined = process.env.CRON_SECRET

  beforeEach(() => {
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved
  })

  it('fails closed with 503 when CRON_SECRET is unset', async () => {
    const response = await GET(new NextRequest('http://localhost/api/publish/run'))
    expect(response.status).toBe(503)
  })

  it('rejects with 401 when the Authorization header does not match CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const response = await GET(
      new NextRequest('http://localhost/api/publish/run', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    )
    expect(response.status).toBe(401)
  })

  it('rejects with 401 when the Authorization header is missing entirely', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const response = await GET(new NextRequest('http://localhost/api/publish/run'))
    expect(response.status).toBe(401)
  })
})
