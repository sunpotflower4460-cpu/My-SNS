import { describe, expect, it } from 'vitest'
import { buildArtistOsStatus, mySnsCapabilities } from './artist-os-status'
import { handleArtistOsStatus } from './artist-os-handler'

const now = new Date('2026-10-05T12:00:00.000Z')
const base = { appUrl: 'https://app.example/', draftsAwaitingApproval: [], publishJobs: [], replyJobs: [], inboxNeedsAction: 0 }

describe('buildArtistOsStatus', () => {
  it('projects pending drafts as approval items that link out (never a machine endpoint)', () => {
    const r = buildArtistOsStatus({ ...base, now, draftsAwaitingApproval: [{ id: 'd1', channel: 'instagram', created_at: '2026-10-05T10:00:00Z' }] })
    expect(r.attention).toHaveLength(1)
    expect(r.attention[0]).toMatchObject({ kind: 'approval', sourceEntityType: 'draft', sourceEntityId: 'd1' })
    expect(r.attention[0]!.action).toEqual({ type: 'deeplink', url: 'https://app.example/app/drafts' })
  })

  it('maps failed jobs to failure attention without leaking provider error text', () => {
    const r = buildArtistOsStatus({
      ...base,
      now,
      publishJobs: [{ id: 'j1', channel: 'x', status: 'failed', scheduled_at: '2026-10-05T09:00:00Z', published_at: null, created_at: '2026-10-04T00:00:00Z' }],
    })
    expect(r.attention[0]).toMatchObject({ kind: 'failure', priority: 'high', sourceEntityId: 'j1' })
    expect(JSON.stringify(r)).not.toMatch(/error_message|token/i)
  })

  it('reports scheduled and published jobs as activity with the real timestamps', () => {
    const r = buildArtistOsStatus({
      ...base,
      now,
      publishJobs: [
        { id: 's', channel: 'x', status: 'scheduled', scheduled_at: '2026-10-05T20:00:00Z', published_at: null, created_at: '2026-10-05T00:00:00Z' },
        { id: 'p', channel: 'x', status: 'published', scheduled_at: null, published_at: '2026-10-05T08:00:00Z', created_at: '2026-10-05T00:00:00Z' },
        { id: 'c', channel: 'x', status: 'cancelled', scheduled_at: null, published_at: null, created_at: '2026-10-05T00:00:00Z' },
      ],
    })
    expect(r.activity.map((a) => `${a.state}:${a.sourceEntityId}`)).toEqual(['scheduled:s', 'completed:p'])
    expect(r.counters).toMatchObject({ publishJobsScheduled: 1, publishJobsPublished: 1 })
  })

  it('aggregates inbox needs-action as a single synthetic item', () => {
    const r = buildArtistOsStatus({ ...base, now, inboxNeedsAction: 3 })
    expect(r.attention).toHaveLength(1)
    expect(r.attention[0]!.summary).toContain('3')
  })

  it('is empty (not an error) when there is nothing to do', () => {
    const r = buildArtistOsStatus({ ...base, now })
    expect(r).toMatchObject({ contractVersion: 1, service: 'my-sns', attention: [], activity: [] })
  })
})

describe('handleArtistOsStatus (fail closed)', () => {
  const env = { token: 'secret', workspaceId: 'w1', appUrl: 'https://app.example' }
  const ok = async () => ({ draftsAwaitingApproval: [], publishJobs: [], replyJobs: [], inboxNeedsAction: 0 })

  it('503 when not configured', async () => {
    for (const bad of [{ ...env, token: undefined }, { ...env, workspaceId: ' ' }, { ...env, appUrl: undefined }]) {
      expect((await handleArtistOsStatus('Bearer secret', bad, ok)).status).toBe(503)
    }
  })
  it('401 on missing or wrong token; never calls the loader', async () => {
    let called = false
    const load = async () => ((called = true), ok())
    expect((await handleArtistOsStatus(null, env, load)).status).toBe(401)
    expect((await handleArtistOsStatus('Bearer nope', env, load)).status).toBe(401)
    expect(called).toBe(false)
  })
  it('scopes the load to the bound workspace only', async () => {
    let seen = ''
    const r = await handleArtistOsStatus('Bearer secret', env, async (w) => ((seen = w), ok()), now)
    expect(r.status).toBe(200)
    expect(seen).toBe('w1')
  })
  it('502 with a generic body when the load throws (no database detail)', async () => {
    const r = await handleArtistOsStatus('Bearer secret', env, async () => {
      throw new Error('relation "secret_table" does not exist')
    })
    expect(r).toEqual({ status: 502, body: { error: 'Status could not be loaded.' } })
  })
})

describe('mySnsCapabilities', () => {
  it('does not claim status.read when service access is not configured', () => {
    expect(mySnsCapabilities({ publishingStrategy: 'zero-cost', serviceKeyConfigured: false })).not.toContain('status.read')
  })
  it('claims manual vs api publishing honestly', () => {
    expect(mySnsCapabilities({ publishingStrategy: 'zero-cost', serviceKeyConfigured: true })).toContain('publish.manual')
    expect(mySnsCapabilities({ publishingStrategy: 'api-first', serviceKeyConfigured: true })).toContain('publish.api')
  })
  it('declares Instagram ingest (so Artist OS can resolve the canonical reply owner) but no send capability', () => {
    const caps = mySnsCapabilities({ publishingStrategy: 'zero-cost', serviceKeyConfigured: true })
    expect(caps).toContain('inbox.instagram.comment.ingest')
    expect(caps.some((c) => c.startsWith('reply.'))).toBe(false)
  })
})
