import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveCredentials = vi.fn()
const fetchMetrics = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeUserClient(),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/api/workspace-access', () => ({
  requireWorkspaceMember: async () => ({ role: 'owner' }),
  isNextResponse: () => false,
}))
vi.mock('@/lib/services/publish-worker', () => ({
  resolveCredentials: (...args: unknown[]) => resolveCredentials(...args),
}))
vi.mock('@/lib/services/connectors', () => ({
  getConnectorAdapter: () => ({ fetchMetrics }),
}))

let jobRow: Record<string, unknown> | null = null

function makeUserClient() {
  const chain = (result: unknown) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'not', 'order', 'limit']) builder[method] = () => builder
    builder.maybeSingle = async () => ({ data: result, error: null })
    return builder
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) =>
      table === 'publish_jobs' ? chain(jobRow) : chain({ external_post_id: 'video-123' }),
  }
}

import { POST } from './route'

function request(body: unknown) {
  return new NextRequest('http://localhost/api/analytics/metrics', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/analytics/metrics', () => {
  beforeEach(() => {
    resolveCredentials.mockReset()
    fetchMetrics.mockReset()
    resolveCredentials.mockResolvedValue({ accessToken: 'token', externalAccountId: 'ext-2', handle: '@second' })
    fetchMetrics.mockResolvedValue({ views: 10 })
  })

  it('resolves credentials for the account the job published with (multi-account workspaces)', async () => {
    jobRow = { id: 'job-1', channel: 'youtube', social_account_id: 'account-2' }

    const response = await POST(request({ workspaceId: 'ws-1', jobId: 'job-1' }))

    expect(response.status).toBe(200)
    expect(resolveCredentials).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'youtube', 'account-2')
    expect(fetchMetrics).toHaveBeenCalledWith(expect.objectContaining({ externalAccountId: 'ext-2', postId: 'video-123' }))
  })

  it('falls back to the single connected account for legacy jobs without a target', async () => {
    jobRow = { id: 'job-2', channel: 'youtube', social_account_id: null }

    await POST(request({ workspaceId: 'ws-1', jobId: 'job-2' }))

    expect(resolveCredentials).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'youtube', undefined)
  })
})
