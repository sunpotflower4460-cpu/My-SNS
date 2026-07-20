import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'
import { isConnectablePlatform } from '@/lib/services/connectors/platforms'

// Small pure presenter for the 接続と設定 page (UI-PR6). Deriving "is this
// platform connected, and by which account" is done in a few places on the page;
// centralising it here keeps the row rendering trivial and makes the selection
// rules (connected flag, LINE handled separately, extra non-connectable
// accounts) unit-testable. No schema/route change.

export interface PlatformConnection {
  connected: boolean
  account: SocialAccount | null
  /** The account handle, or a placeholder when not connected. */
  handle: string
}

/** The connected account for one platform (if any), plus a display handle. */
export function getPlatformConnection(platform: SocialPlatform, accounts: SocialAccount[]): PlatformConnection {
  const account = accounts.find((entry) => entry.platform === platform && entry.connected) ?? null
  return { connected: Boolean(account), account, handle: account?.handle ?? '未接続' }
}

/**
 * Connected accounts that aren't in the OAuth-connectable list and aren't LINE —
 * surfaced read-only so a manually/otherwise connected platform still shows.
 * LINE is excluded because it has its own dedicated messaging section.
 */
export function getExtraConnectedAccounts(accounts: SocialAccount[]): SocialAccount[] {
  return accounts.filter(
    (account) => account.connected && !isConnectablePlatform(account.platform) && account.platform !== 'line',
  )
}
