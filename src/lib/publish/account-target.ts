import type { PublishingChannel, SocialAccount, SocialPlatform } from '@/lib/domain/types'

export type AccountTargetErrorCode = 'not_connected' | 'missing_selection' | 'unknown_account' | 'platform_mismatch'

export interface AccountTargetSuccess {
  ok: true
  account: SocialAccount
}

export interface AccountTargetFailure {
  ok: false
  code: AccountTargetErrorCode
  message: string
}

export type AccountTargetResult = AccountTargetSuccess | AccountTargetFailure

export function connectedAccountsForPlatform(
  accounts: SocialAccount[],
  platform: SocialPlatform,
): SocialAccount[] {
  return accounts.filter((account) => account.platform === platform && account.connected)
}

/**
 * Picks the connected account a publish job should use.
 *
 * - 0 connected → fail closed (never invent a publish target)
 * - 1 connected → use it, even if no explicit id was stored (legacy jobs)
 * - 2+ connected and no/invalid requested id → fail closed
 */
export function selectSocialAccountForPublish(params: {
  accounts: SocialAccount[]
  platform: SocialPlatform
  requestedAccountId?: string | null
}): AccountTargetResult {
  const connected = connectedAccountsForPlatform(params.accounts, params.platform)

  if (params.requestedAccountId) {
    const requested = params.accounts.find((account) => account.id === params.requestedAccountId)
    if (!requested) {
      return {
        ok: false,
        code: 'unknown_account',
        message: `指定された${params.platform}アカウントが見つかりません。設定の接続状態を確認してください。`,
      }
    }
    if (requested.platform !== params.platform) {
      return {
        ok: false,
        code: 'platform_mismatch',
        message: `指定されたアカウントは${requested.platform}であり、${params.platform}の投稿には使えません。`,
      }
    }
    if (!requested.connected) {
      return {
        ok: false,
        code: 'not_connected',
        message: `指定された${params.platform}アカウントは接続されていません。設定から再接続してください。`,
      }
    }
    return { ok: true, account: requested }
  }

  if (connected.length === 0) {
    return {
      ok: false,
      code: 'not_connected',
      message: `No connected ${params.platform} account for this workspace. Connect one from Settings.`,
    }
  }

  if (connected.length > 1) {
    return {
      ok: false,
      code: 'missing_selection',
      message: `${params.platform}アカウントが複数接続されています。下書きまたは予約時に投稿先アカウントを選んでください。`,
    }
  }

  return { ok: true, account: connected[0] }
}

export function isSocialPlatformChannel(channel: PublishingChannel): channel is SocialPlatform {
  return channel !== 'note' && channel !== 'website'
}
