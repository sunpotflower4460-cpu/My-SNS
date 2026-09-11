import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireWorkspaceMember: vi.fn(),
  generateReplySuggestionForItem: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({}),
}))
vi.mock('@/lib/api/workspace-access', () => ({
  requireWorkspaceMember: mocks.requireWorkspaceMember,
  isNextResponse: (value: unknown) => value instanceof Response,
}))
vi.mock('@/lib/services/inbox-reply-generation', () => ({
  generateReplySuggestionForItem: mocks.generateReplySuggestionForItem,
}))

import { POST } from './route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/inbox/reply/generate-bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/inbox/reply/generate-bulk', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects with 400 when inboxItemIds is missing or empty', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.requireWorkspaceMember.mockResolvedValue({ role: 'editor' })

    const response = await POST(request({ workspaceId: 'w1', inboxItemIds: [] }))
    expect(response.status).toBe(400)
    expect(mocks.generateReplySuggestionForItem).not.toHaveBeenCalled()
  })

  it('rejects with 400 when more than 20 items are requested', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.requireWorkspaceMember.mockResolvedValue({ role: 'editor' })

    const ids = Array.from({ length: 21 }, (_, i) => `item-${i}`)
    const response = await POST(request({ workspaceId: 'w1', inboxItemIds: ids }))
    expect(response.status).toBe(400)
    expect(mocks.generateReplySuggestionForItem).not.toHaveBeenCalled()
  })

  it('rejects with 401 when not logged in, before touching any item', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(request({ workspaceId: 'w1', inboxItemIds: ['item-1'] }))
    expect(response.status).toBe(401)
    expect(mocks.generateReplySuggestionForItem).not.toHaveBeenCalled()
  })

  it('processes every item sequentially and aggregates partial success (e.g. mid-batch budget exhaustion)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.requireWorkspaceMember.mockResolvedValue({ role: 'editor' })
    mocks.generateReplySuggestionForItem
      .mockResolvedValueOnce({ status: 200, body: { source: 'ai', reply: 'reply 1' } })
      .mockResolvedValueOnce({ status: 200, body: { source: 'ai', reply: 'reply 2' } })
      .mockResolvedValueOnce({ status: 402, body: { error: 'AI予算に達しました。' } })

    const response = await POST(request({ workspaceId: 'w1', inboxItemIds: ['item-1', 'item-2', 'item-3'] }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.succeeded).toBe(2)
    expect(payload.failed).toBe(1)
    expect(payload.results.map((r: { inboxItemId: string }) => r.inboxItemId)).toEqual(['item-1', 'item-2', 'item-3'])
    expect(payload.results[2].status).toBe(402)

    // Sequential, not parallel: called once per item, in the order given.
    expect(mocks.generateReplySuggestionForItem).toHaveBeenCalledTimes(3)
    expect(mocks.generateReplySuggestionForItem.mock.calls[0][2]).toMatchObject({ inboxItemId: 'item-1' })
    expect(mocks.generateReplySuggestionForItem.mock.calls[2][2]).toMatchObject({ inboxItemId: 'item-3' })
  })
})
