import type { InboundInboxEvent, SocialAccount } from '@/lib/domain/types'

export interface InboxSyncAccountFailure {
  accountId: string
  handle: string
  /** Creator-safe message (provider / DB internals are never included). */
  message: string
}

export interface InboxSyncResult {
  ingested: number
  /** Accounts that were synced (or had nothing to sync) without error. */
  succeededAccounts: number
  failures: InboxSyncAccountFailure[]
}

/**
 * Connector feature-gap messages are useful to the creator (for example
 * "Instagram uses webhook push"), but provider/DB internals belong in logs.
 */
export function toSafeInboxSyncMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : '同期に失敗しました。'
  return detail.includes('not available')
    || detail.includes('via webhook')
    || detail.includes('no direct-message API')
    || detail.includes('有料API')
    ? detail
    : '受信箱の同期に失敗しました。接続状態と通信状況を確認してから再試行してください。'
}

/**
 * Syncs each connected account independently. One account's failure (for
 * example a credential refresh that throws) is collected and reported, and
 * never aborts the accounts after it.
 */
export async function syncInboxForAccounts(params: {
  accounts: Array<Pick<SocialAccount, 'id' | 'handle'>>
  syncAccount: (account: Pick<SocialAccount, 'id' | 'handle'>) => Promise<InboundInboxEvent[] | null>
  ingest: (events: InboundInboxEvent[]) => Promise<number>
  onError?: (account: Pick<SocialAccount, 'id' | 'handle'>, cause: unknown) => void
}): Promise<InboxSyncResult> {
  let ingested = 0
  let succeededAccounts = 0
  const failures: InboxSyncAccountFailure[] = []

  for (const account of params.accounts) {
    try {
      const events = await params.syncAccount(account)
      if (events) ingested += await params.ingest(events)
      succeededAccounts += 1
    } catch (cause) {
      params.onError?.(account, cause)
      failures.push({ accountId: account.id, handle: account.handle, message: toSafeInboxSyncMessage(cause) })
    }
  }

  return { ingested, succeededAccounts, failures }
}
