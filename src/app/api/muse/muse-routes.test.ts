import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMuseKey, MUSE_REQUEST_MAX_BYTES, sha256 } from '@/lib/muse/connector'
import { museOpenPath } from '@/lib/muse/links'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn(), requireWorkspaceMember: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/api/workspace-access', () => ({ requireWorkspaceMember: mocks.requireWorkspaceMember }))

import { GET as getStatus } from './v1/status/route'
import { POST as captureSeed } from './v1/seeds/route'
import { GET as getConnection, POST as issueKey } from './connection/route'

const origin = 'https://my-sns.example'
const workspaceId = '10000000-0000-0000-0000-000000000001'
const seedId = '20000000-0000-0000-0000-000000000002'
const actor = '30000000-0000-0000-0000-000000000003'
const requestId = '40000000-0000-0000-0000-000000000004'
const key = createMuseKey()
const body = { requestId, title: '新曲の制作メモ', sourceText: '来月の配信に向けて新曲を制作中。', targetChannels: ['instagram', 'x'] }

function seedRequest(input: unknown) {
  return new Request(`${origin}/api/muse/v1/seeds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

beforeEach(() => { vi.resetAllMocks() })

describe('Muse requests', () => {
  it('does not look up data for a missing or incorrectly formatted key', async () => {
    const response = await getStatus(new Request(`${origin}/api/muse/v1/status`, {
      headers: { Authorization: 'Bearer some-other-token' },
    }))
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('Bearer')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns only action counts and scoped review links for a valid key', async () => {
    mocks.rpc.mockResolvedValue({ data: {
      workspaceId, canCapture: false, draftsToReview: 2, failedPosts: 1, duePosts: 3, inboxNeedsAction: 4,
      privateMessage: 'should never be forwarded',
    } })
    const response = await getStatus(new Request(`${origin}/api/muse/v1/status`, {
      headers: { Authorization: `Bearer ${key.key}` },
    }))
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(await response.json()).toEqual({
      canCapture: false,
      counts: { draftsToReview: 2, failedPosts: 1, duePosts: 3, inboxNeedsAction: 4 },
      urls: Object.fromEntries((['home', 'drafts', 'queue', 'inbox'] as const).map((view) =>
        [view, origin + museOpenPath({ workspaceId, view })],
      )),
    })
    expect(mocks.rpc).toHaveBeenCalledWith('get_muse_connector_status', { p_token_hash: key.hash })
  })

  it('rejects arbitrary workspace, status and target channels and bounds the body before any write', async () => {
    for (const input of [
      { ...body, workspaceId },
      { ...body, status: 'ready' },
      { ...body, targetChannels: ['line'] },
      { ...body, sourceText: '\u0000' },
    ]) expect((await captureSeed(seedRequest(input))).status).toBe(400)
    const response = await captureSeed(seedRequest({ ...body, sourceText: 'あ'.repeat(MUSE_REQUEST_MAX_BYTES) }))
    expect(response.status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('retries the same note even if the channel order changed and returns the original review link', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { workspaceId, seedId, created: true } })
      .mockResolvedValueOnce({ data: { workspaceId, seedId, created: false } })
    const created = await captureSeed(seedRequest(body))
    const replay = await captureSeed(seedRequest({ ...body, targetChannels: ['x', 'instagram'] }))
    expect(created.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1])
    expect(mocks.rpc).toHaveBeenCalledWith('capture_muse_seed', expect.objectContaining({
      p_token_hash: key.hash, p_request_id: requestId, p_source_text: body.sourceText,
    }))
    expect(await replay.json()).toEqual({ created: false, seedId, url: origin + museOpenPath({ workspaceId, view: 'seed', seedId }) })
  })

  it.each([
    ['INVALID_KEY', 401],
    ['READ_ONLY', 403],
    ['REQUEST_CONFLICT', 409],
    ['SEED_REMOVED', 409],
    ['CAPTURE_LIMIT', 429],
  ])('does not claim a save for %s', async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: { code } })
    const response = await captureSeed(seedRequest(body))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ code, error: expect.any(String) })
  })
})

describe('Muse key management', () => {
  const url = `${origin}/api/muse/connection?workspaceId=${workspaceId}`
  const request = () => new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canCapture: false }),
  })

  it('requires a signed-in user with permission to manage the selected workspace', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } }).mockResolvedValueOnce({ data: { user: { id: actor } } })
    mocks.requireWorkspaceMember.mockResolvedValueOnce(NextResponse.json({ error: 'denied' }, { status: 403 }))
    expect((await issueKey(request())).status).toBe(401)
    expect((await issueKey(request())).status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('stores only a hash and never returns the key from a later read', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } } })
    mocks.requireWorkspaceMember.mockResolvedValue({ role: 'owner' })
    const upsert = vi.fn().mockResolvedValue({})
    const select = vi.fn()
    const expires_at = new Date().toISOString()
    select.mockReturnValue({ eq: () => ({ maybeSingle: async () => ({ data: { expires_at, can_capture: false, token_hash: 'not-public' } }) }) })
    mocks.from.mockReturnValue({ upsert, select })

    const issued = await issueKey(request())
    expect(issued.status).toBe(201)
    expect(issued.headers.get('Cache-Control')).toContain('no-store')
    const data = await issued.json()
    expect(upsert).toHaveBeenCalledWith({
      workspace_id: workspaceId, issued_by: actor, token_hash: sha256(data.key), expires_at: data.credential.expiresAt, can_capture: false,
    }, { onConflict: 'workspace_id' })
    expect(select).not.toHaveBeenCalled()

    const status = await getConnection(new Request(url))
    expect(await status.json()).toEqual({ credential: { expiresAt: expires_at, canCapture: false } })
  })
})
