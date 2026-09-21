import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveCredentials = vi.fn()
const fetchMetrics = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeUserClient(),
}))
// social_accounts lookups: the row the job points at, then (when it was
// retired) the connected row for the same external account.
let accountRow: Record<string, unknown> | null = null
let successorRow: Record<string, unknown> | null = null
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      let isSuccessorQuery = false
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'limit']) builder[method] = () => builder
      builder.eq = (column: string) => {
        if (column === 'connected') isSuccessorQuery = true
        return builder
      }
      builder.maybeSingle = async () => ({ data: isSuccessorQuery ? successorRow : accountRow, error: null })
      return builder
    },
  }),
}))
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
    accountRow = { id: 'account-2', platform: 'youtube', external_account_id: 'ext-2', handle: '@second', connected: true }
    successorRow = null
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

  it('follows a retired account to the reconnected one so old posts still show metrics', async () => {
    jobRow = { id: 'job-3', channel: 'youtube', social_account_id: 'account-old' }
    accountRow = { id: 'account-old', platform: 'youtube', external_account_id: 'ext-2', handle: '@second', connected: false }
    successorRow = { id: 'account-new' }

    const response = await POST(request({ workspaceId: 'ws-1', jobId: 'job-3' }))

    expect(response.status).toBe(200)
    expect(resolveCredentials).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'youtube', 'account-new')
  })

  it('lets resolveCredentials fall back when a retired account has no successor', async () => {
    jobRow = { id: 'job-4', channel: 'youtube', social_account_id: 'account-old' }
    accountRow = { id: 'account-old', platform: 'youtube', external_account_id: 'ext-9', handle: '@gone', connected: false }
    successorRow = null

    await POST(request({ workspaceId: 'ws-1', jobId: 'job-4' }))

    expect(resolveCredentials).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'youtube', undefined)
  })
})
