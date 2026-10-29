import { describe, expect, it } from 'vitest'
import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'
import { connectedAccountsForPlatform, selectSocialAccountForPublish } from './account-target'

function account(over: Partial<SocialAccount> & { id: string; platform: SocialPlatform }): SocialAccount {
  return {
    workspaceId: 'w',
    handle: over.handle ?? over.id,
    connected: true,
    updatedAt: '2026-08-28T00:00:00Z',
    ...over,
  }
}

describe('selectSocialAccountForPublish', () => {
  const youtubeA = account({ id: 'yt-a', platform: 'youtube', handle: 'Channel A' })
  const youtubeB = account({ id: 'yt-b', platform: 'youtube', handle: 'Channel B' })
  const xOnly = account({ id: 'x-1', platform: 'x', handle: '@one' })

  it('uses the only connected account when none was requested', () => {
    const result = selectSocialAccountForPublish({
      accounts: [youtubeA, xOnly],
      platform: 'youtube',
    })
    expect(result).toEqual({ ok: true, account: youtubeA })
  })

  it('fails closed when two accounts exist and none was requested', () => {
    const result = selectSocialAccountForPublish({
      accounts: [youtubeA, youtubeB],
      platform: 'youtube',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('missing_selection')
  })

  it('uses the requested account among several', () => {
    const result = selectSocialAccountForPublish({
      accounts: [youtubeA, youtubeB],
      platform: 'youtube',
      requestedAccountId: 'yt-b',
    })
    expect(result).toEqual({ ok: true, account: youtubeB })
  })

  it('fails closed when the requested account is disconnected', () => {
    const result = selectSocialAccountForPublish({
      accounts: [account({ id: 'yt-a', platform: 'youtube', connected: false })],
      platform: 'youtube',
      requestedAccountId: 'yt-a',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_connected')
  })

  it('fails closed when the requested account is for another platform', () => {
    const result = selectSocialAccountForPublish({
      accounts: [youtubeA, xOnly],
      platform: 'youtube',
      requestedAccountId: 'x-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('platform_mismatch')
  })

  it('fails closed when no connected account exists', () => {
    const result = selectSocialAccountForPublish({ accounts: [xOnly], platform: 'youtube' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_connected')
  })
})

describe('connectedAccountsForPlatform', () => {
  it('ignores disconnected rows', () => {
    const accounts = [
      account({ id: 'a', platform: 'x', connected: true }),
      account({ id: 'b', platform: 'x', connected: false }),
      account({ id: 'c', platform: 'youtube', connected: true }),
    ]
    expect(connectedAccountsForPlatform(accounts, 'x').map((entry) => entry.id)).toEqual(['a'])
  })
})
