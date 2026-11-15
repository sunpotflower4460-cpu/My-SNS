import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as approve } from './oauth/approve/route'
import { POST as exchange } from './oauth/token/route'
import { POST as mcp } from './mcp/route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireWorkspaceMember: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/api/workspace-access', () => ({ requireWorkspaceMember: mocks.requireWorkspaceMember }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }))

const origin = 'https://my-sns.example'
const workspaceId = '10000000-0000-0000-0000-000000000001'
const userId = '30000000-0000-0000-0000-000000000003'
const callback = 'https://muse.ai/api/hatch/oauth/callback'
const verifier = 'A'.repeat(48)
const challenge = createHash('sha256').update(verifier).digest('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

function approvalRequest(requestOrigin = origin, scope = 'muse:read muse:capture', redirectUri = callback, canCapture = true) {
  return new Request(`${origin}/api/muse/oauth/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
    body: JSON.stringify({
      workspaceId,
      canCapture,
      authorization: new URLSearchParams({
        client_id: 'my-sns-muse',
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope,
        state: 'muse-state+1',
      }).toString(),
    }),
  })
}

function tokenRequest(resource = `${origin}/api/muse/mcp`) {
  return new Request(`${origin}/api/muse/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: 'my-sns-muse',
      grant_type: 'authorization_code',
      redirect_uri: callback,
      code: 'c'.repeat(43),
      code_verifier: verifier,
      resource,
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } } })
  mocks.requireWorkspaceMember.mockResolvedValue({ role: 'owner' })
})

describe('Muse authorization', () => {
  it('rejects foreign forms, an unregistered callback, and attempts to widen the requested scope', async () => {
    expect((await approve(approvalRequest('https://attacker.example'))).status).toBe(403)
    expect((await approve(approvalRequest(origin, 'muse:read', 'https://muse.ai@attacker.example/api/hatch/oauth/callback'))).status).toBe(400)
    expect((await approve(approvalRequest(origin, 'muse:read'))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('checks the signed-in workspace role and returns only a one-time code to the registered callback', async () => {
    mocks.rpc.mockResolvedValue({ data: true })
    const response = await approve(approvalRequest(origin, 'muse:read muse:capture', callback, false))
    const result = await response.json()
    const destination = new URL(result.redirectTo)
    expect(destination.origin + destination.pathname).toBe(callback)
    expect(destination.searchParams.get('state')).toBe('muse-state+1')
    expect(destination.searchParams.has('access_token')).toBe(false)
    expect(mocks.requireWorkspaceMember).toHaveBeenCalledWith(expect.anything(), workspaceId, userId, 'edit_settings', expect.any(String))
    expect(mocks.rpc).toHaveBeenCalledWith('approve_muse_oauth', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_code_hash: hash(destination.searchParams.get('code')!),
      p_code_challenge: challenge,
      p_redirect_uri: callback,
      p_can_capture: false,
    })
  })

  it('checks the audience and sends the PKCE proof to the atomic exchange', async () => {
    expect((await exchange(tokenRequest('https://attacker.example/api/muse/mcp'))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ data: { canCapture: false } }).mockResolvedValueOnce({ data: null })
    const response = await exchange(tokenRequest())
    expect(response.headers.get('cache-control')).toContain('no-store')
    const token = await response.json()
    expect(token).toMatchObject({ token_type: 'Bearer', scope: 'muse:read' })
    expect(mocks.rpc).toHaveBeenCalledWith('exchange_muse_oauth_code', expect.objectContaining({
      p_code_hash: hash('c'.repeat(43)),
      p_code_challenge: challenge,
      p_redirect_uri: callback,
      p_token_hash: hash(token.access_token),
    }))
    expect(await (await exchange(tokenRequest())).json()).toEqual({ error: 'invalid_grant' })
  })
})

describe('Muse MCP', () => {
  function request(method: string, params?: unknown, authorization?: string) {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (authorization) headers.set('Authorization', authorization)
    return new Request(`${origin}/api/muse/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
  }

  it('advertises where an unauthenticated Muse client can discover OAuth', async () => {
    const response = await mcp(request('initialize'))
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(`${origin}/.well-known/oauth-protected-resource/api/muse/mcp`)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not expose a write tool after read-only approval', async () => {
    const key = `Bearer mysns_muse_${'k'.repeat(43)}`
    mocks.rpc.mockResolvedValue({
      data: { workspaceId, canCapture: false, draftsToReview: 1, failedPosts: 0, duePosts: 0, inboxNeedsAction: 2 },
    })
    const { result } = await (await mcp(request('tools/list', {}, key))).json()
    expect(result.tools.map(({ name }: { name: string }) => name)).toEqual(['get_my_sns_status'])
    const forbidden = await mcp(request('tools/call', { name: 'save_my_sns_seed' }, key))
    expect(await forbidden.json()).toMatchObject({ error: { code: -32602 } })
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['get_muse_connector_status', 'get_muse_connector_status'])
  })
})
