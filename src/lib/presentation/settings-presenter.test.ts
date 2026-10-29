import { describe, expect, it } from 'vitest'
import { getExtraConnectedAccounts, getPlatformConnection } from './settings-presenter'
import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'

function account(over: Partial<SocialAccount> & { platform: SocialPlatform }): SocialAccount {
  return {
    id: `a-${over.platform}`,
    workspaceId: 'w',
    handle: `@${over.platform}`,
    connected: true,
    updatedAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

describe('getPlatformConnection', () => {
  it('finds the connected account for a platform', () => {
    const accounts = [account({ platform: 'x', handle: '@me' })]
    const conn = getPlatformConnection('x', accounts)
    expect(conn.connected).toBe(true)
    expect(conn.account?.handle).toBe('@me')
    expect(conn.handle).toBe('@me')
  })

  it('ignores a disconnected account and shows the placeholder handle', () => {
    const accounts = [account({ platform: 'x', connected: false })]
    const conn = getPlatformConnection('x', accounts)
    expect(conn.connected).toBe(false)
    expect(conn.account).toBeNull()
    expect(conn.handle).toBe('未接続')
  })

  it('summarizes multiple connected accounts without dropping them', () => {
    const conn = getPlatformConnection('youtube', [
      account({ platform: 'youtube', handle: 'Main' }),
      account({ id: 'a-youtube-2', platform: 'youtube', handle: 'Second' }),
    ])
    expect(conn.connected).toBe(true)
    expect(conn.handle).toContain('ほか1件')
  })

  it('does not match a different platform', () => {
    const conn = getPlatformConnection('instagram', [account({ platform: 'x' })])
    expect(conn.connected).toBe(false)
  })
})

describe('getExtraConnectedAccounts', () => {
  it('returns connected accounts that are neither OAuth-connectable nor LINE', () => {
    const accounts = [
      account({ platform: 'x' }), // connectable → excluded
      account({ platform: 'line' }), // LINE → excluded (own section)
      account({ platform: 'threads' }), // not connectable, connected → included
      account({ platform: 'facebook', connected: false }), // disconnected → excluded
    ]
    expect(getExtraConnectedAccounts(accounts).map((a) => a.platform)).toEqual(['threads'])
  })

  it('is empty when everything is connectable or LINE', () => {
    expect(getExtraConnectedAccounts([account({ platform: 'x' }), account({ platform: 'line' })])).toEqual([])
  })
})
