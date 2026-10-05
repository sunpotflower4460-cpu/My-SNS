import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const keys = ['ARTIST_OS_MODE', 'ARTIST_OS_LEDGER_URL', 'ARTIST_OS_LEDGER_TOKEN', 'ARTIST_OS_SERVICE_TOKEN', 'ARTIST_OS_WORKSPACE_ID', 'NEXT_PUBLIC_APP_URL', 'SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL']
afterEach(() => {
  for (const k of keys) vi.stubEnv(k, '')
  vi.unstubAllEnvs()
})
const configured = () => {
  vi.stubEnv('ARTIST_OS_SERVICE_TOKEN', 's')
  vi.stubEnv('ARTIST_OS_WORKSPACE_ID', 'w')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'k')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
}

describe('GET /api/service/health', () => {
  it('standalone: healthy, reports the mode and who owns what', async () => {
    configured()
    const b = await (await GET()).json()
    expect(b).toMatchObject({ contractVersion: 1, service: 'my-sns', status: 'healthy', runtimeMode: 'standalone', modeInvalid: false })
    expect(b.ownership).toMatchObject({ canonicalMetaWebhookReceiver: true, inboundReplyExecution: { line: true, instagram: false } })
    expect(b.capabilities).toContain('inbox.instagram.comment.ingest')
    expect(b.capabilities).not.toContain('webhook.meta.canonical')
  })
  it('managed without a ledger: DEGRADED with the reason (replies would fail closed)', async () => {
    configured()
    vi.stubEnv('ARTIST_OS_MODE', 'artist_os_managed')
    const b = await (await GET()).json()
    expect(b.status).toBe('degraded')
    expect(b.degradedReason).toMatch(/LEDGER/)
    expect(b.runtimeMode).toBe('artist_os_managed')
  })
  it('managed with a ledger: healthy and advertises canonical Meta receiver + inbound-events', async () => {
    configured()
    vi.stubEnv('ARTIST_OS_MODE', 'artist_os_managed')
    vi.stubEnv('ARTIST_OS_LEDGER_URL', 'https://aos.example')
    vi.stubEnv('ARTIST_OS_LEDGER_TOKEN', 'tok')
    const b = await (await GET()).json()
    expect(b.status).toBe('healthy')
    expect(b.capabilities).toEqual(expect.arrayContaining(['webhook.meta.canonical', 'inbox.inbound-events.read']))
    expect(JSON.stringify(b)).not.toContain('tok')
  })
  it('an invalid mode value is managed + invalid + degraded', async () => {
    configured()
    vi.stubEnv('ARTIST_OS_MODE', 'managd')
    const b = await (await GET()).json()
    expect(b).toMatchObject({ status: 'degraded', runtimeMode: 'artist_os_managed', modeInvalid: true })
  })
  it('never exposes secrets', async () => {
    configured()
    const text = JSON.stringify(await (await GET()).json())
    for (const secret of ['"s"', 'https://x.supabase.co']) expect(text).not.toContain(secret)
  })
})
