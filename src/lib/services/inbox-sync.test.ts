import { describe, expect, it, vi } from 'vitest'
import type { InboundInboxEvent } from '@/lib/domain/types'
import { syncInboxForAccounts, toSafeInboxSyncMessage } from './inbox-sync'

function event(id: string): InboundInboxEvent {
  return {
    platform: 'youtube',
    kind: 'comment',
    externalId: id,
    authorHandle: 'fan',
    text: 'hi',
    receivedAt: '2026-01-01T00:00:00Z',
  }
}

describe('syncInboxForAccounts', () => {
  it('keeps syncing other accounts when one account throws, and reports the failure', async () => {
    const accounts = [
      { id: 'a1', handle: '@one' },
      { id: 'a2', handle: '@two' },
      { id: 'a3', handle: '@three' },
    ]
    const onError = vi.fn()

    const result = await syncInboxForAccounts({
      accounts,
      syncAccount: async (account) => {
        if (account.id === 'a2') throw new Error('token refresh failed: secret provider detail')
        return [event(`e-${account.id}`)]
      },
      ingest: async (events) => events.length,
      onError,
    })

    expect(result.ingested).toBe(2)
    expect(result.succeededAccounts).toBe(2)
    expect(result.failures).toEqual([
      {
        accountId: 'a2',
        handle: '@two',
        message: '受信箱の同期に失敗しました。接続状態と通信状況を確認してから再試行してください。',
      },
    ])
    expect(JSON.stringify(result)).not.toContain('secret provider detail')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('collects an ingest failure per account too', async () => {
    const result = await syncInboxForAccounts({
      accounts: [{ id: 'a1', handle: '@one' }, { id: 'a2', handle: '@two' }],
      syncAccount: async (account) => [event(account.id)],
      ingest: async (events) => {
        if (events[0].externalId === 'a1') throw new Error('db down')
        return 1
      },
    })

    expect(result.ingested).toBe(1)
    expect(result.failures.map((failure) => failure.accountId)).toEqual(['a1'])
  })

  it('treats an account with no credentials as nothing to sync, not a failure', async () => {
    const result = await syncInboxForAccounts({
      accounts: [{ id: 'a1', handle: '@one' }],
      syncAccount: async () => null,
      ingest: async () => {
        throw new Error('should not be called')
      },
    })

    expect(result).toEqual({ ingested: 0, succeededAccounts: 1, failures: [] })
  })

  it('reports every account as failed when all throw', async () => {
    const result = await syncInboxForAccounts({
      accounts: [{ id: 'a1', handle: '@one' }, { id: 'a2', handle: '@two' }],
      syncAccount: async () => {
        throw new Error('boom')
      },
      ingest: async () => 0,
    })

    expect(result.succeededAccounts).toBe(0)
    expect(result.failures).toHaveLength(2)
  })
})

describe('toSafeInboxSyncMessage', () => {
  it('passes through honest connector feature-gap messages', () => {
    expect(toSafeInboxSyncMessage(new Error('Instagram comments arrive via webhook'))).toContain('via webhook')
  })
})
