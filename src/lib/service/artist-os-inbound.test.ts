import { describe, expect, it } from 'vitest'
import { buildInboundEvents } from './artist-os-inbound'
import { handleArtistOsInbound } from './artist-os-handler'

const now = new Date('2026-10-05T12:00:00Z')
const row = (over: Record<string, unknown> = {}) => ({ id: 'i1', platform: 'instagram', kind: 'comment', external_id: '17900000000000001', author_handle: 'fan', text: 'great song!', received_at: '2026-10-05T10:00:00Z', needs_action: true, contact_external_id: null, ...over })

describe('buildInboundEvents', () => {
  it('exposes a public comment excerpt and the native external id (the ledger key basis)', () => {
    const r = buildInboundEvents({ now, rows: [row()], replyJobs: [] })
    expect(r.events[0]).toMatchObject({ platform: 'instagram', kind: 'comment', externalEventId: '17900000000000001', textExcerpt: 'great song!', replyState: 'none', ownerSystem: 'my-sns' })
  })
  it('NEVER exposes DM text', () => {
    const r = buildInboundEvents({ now, rows: [row({ kind: 'dm', text: 'private message', contact_external_id: 'PSID-1' })], replyJobs: [] })
    expect(r.events[0]!.textExcerpt).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('private message')
    expect(r.events[0]!.contactRef).toEqual({ platform: 'instagram', externalContactId: 'PSID-1' })
  })
  it('strips internal prefixes so every system derives the same native id', () => {
    expect(buildInboundEvents({ now, rows: [row({ external_id: 'ig-comment-555' })], replyJobs: [] }).events[0]!.externalEventId).toBe('555')
  })
  it('skips rows that cannot be keyed (no id, colon in id, unknown platform/kind) instead of guessing', () => {
    const r = buildInboundEvents({ now, rows: [row({ external_id: null }), row({ id: 'b', external_id: 'a:b' }), row({ id: 'c', platform: 'mastodon' }), row({ id: 'd', kind: 'weird' })], replyJobs: [] })
    expect(r.events).toHaveLength(0)
  })
  it('reports the most advanced reply state and truncates long text', () => {
    const r = buildInboundEvents({ now, rows: [row({ text: 'x'.repeat(1000) })], replyJobs: [{ inbox_item_id: 'i1', status: 'failed' }, { inbox_item_id: 'i1', status: 'sent' }] })
    expect(r.events[0]!.replyState).toBe('sent')
    expect(r.events[0]!.textExcerpt).toHaveLength(280)
  })
})

describe('handleArtistOsInbound (fail closed)', () => {
  const env = { token: 's', workspaceId: 'w' }
  const load = async () => ({ rows: [row()], replyJobs: [] })
  it('503 unconfigured, 401 wrong token (loader untouched), 200 ok, 502 generic on failure', async () => {
    expect((await handleArtistOsInbound('Bearer s', { token: 's' }, load)).status).toBe(503)
    let called = false
    expect((await handleArtistOsInbound('Bearer x', env, async () => ((called = true), load()))).status).toBe(401)
    expect(called).toBe(false)
    expect((await handleArtistOsInbound('Bearer s', env, load, now)).status).toBe(200)
    expect(await handleArtistOsInbound('Bearer s', env, async () => { throw new Error('relation x does not exist') })).toEqual({ status: 502, body: { error: 'Inbound events could not be loaded.' } })
  })
})
