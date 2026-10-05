import type { ActionKeyParts, LedgerPort } from './action-ledger-client'
import type { ArtistOsMode } from './artist-os-mode'

/** Same shape the Artist OS ledger accepts: a native event id with no ':' or whitespace. */
const NATIVE_ID = /^[A-Za-z0-9._\-=]{1,200}$/

export type BlockReason = 'LEDGER_NOT_CONFIGURED' | 'LEDGER_UNAVAILABLE' | 'INVALID_ACTION_KEY' | 'ALREADY_RESERVED' | 'ALREADY_SUCCEEDED' | 'OUTCOME_UNKNOWN' | 'CONFLICT' | 'BEGIN_REFUSED'

export type GuardOutcome<T> =
  | { kind: 'sent'; value: T; ledgerRecorded: boolean }
  | { kind: 'blocked'; reason: BlockReason; detail?: string }
  /** The provider call ran and failed; `error` is rethrown by the caller after the ledger was told. */
  | { kind: 'failed'; error: unknown; ledgerRecorded: boolean; safeToRetry: boolean }

export interface GuardArgs<T> {
  mode: ArtistOsMode
  ledger: LedgerPort | null
  /** Built from the inbound event's NATIVE id (never reply text). Null when it cannot be built. */
  parts: ActionKeyParts | null
  send: () => Promise<T>
  /** true ⇒ the provider definitively did NOT accept the reply (safe to retry); false ⇒ outcome uncertain. */
  isDefinitiveFailure: (error: unknown) => boolean
}

/**
 * Wraps the ONE external inbound-reply write.
 *
 * standalone: calls `send` exactly as before.
 * managed:    reserve → begin → send → complete, and fails closed at every step:
 *   - no ledger configured / ledger unreachable / unrecognized answer ⇒ DO NOT SEND
 *   - not ACQUIRED (already reserved, already succeeded, OUTCOME_UNKNOWN, conflict) ⇒ DO NOT SEND
 *   - `begin` refused ⇒ DO NOT SEND
 *   - provider error: definitive ⇒ failed_safe; anything else ⇒ OUTCOME_UNKNOWN (nobody resends until reconciled)
 *   - provider success but ledger `complete` unreachable ⇒ the row stays EXECUTING and its lease expiry turns it
 *     into OUTCOME_UNKNOWN: still fail closed, and the success is reported to the caller.
 */
export async function runWithInboundReplyLedger<T>(args: GuardArgs<T>): Promise<GuardOutcome<T>> {
  if (args.mode === 'standalone') return { kind: 'sent', value: await args.send(), ledgerRecorded: false }

  if (!args.ledger) return { kind: 'blocked', reason: 'LEDGER_NOT_CONFIGURED', detail: 'managed mode needs ARTIST_OS_LEDGER_URL and ARTIST_OS_LEDGER_TOKEN' }
  if (!args.parts || !NATIVE_ID.test(args.parts.externalEventId)) {
    return { kind: 'blocked', reason: 'INVALID_ACTION_KEY', detail: 'inbound event has no usable native id; cannot coordinate' }
  }

  const reserved = await args.ledger.reserve(args.parts)
  if (reserved.status === 'LEDGER_UNAVAILABLE') return { kind: 'blocked', reason: 'LEDGER_UNAVAILABLE', detail: reserved.detail }
  if (reserved.status !== 'ACQUIRED') return { kind: 'blocked', reason: reserved.status, detail: reserved.detail }

  if (!(await args.ledger.begin(args.parts, reserved.reservationToken))) {
    return { kind: 'blocked', reason: 'BEGIN_REFUSED', detail: 'ledger did not move the reservation to EXECUTING' }
  }

  let value: T
  try {
    value = await args.send()
  } catch (error) {
    const safe = args.isDefinitiveFailure(error)
    const recorded = await args.ledger
      .complete(args.parts, reserved.reservationToken, safe ? { outcome: 'failed_safe', failureCode: errorCode(error) } : { outcome: 'unknown', reason: errorCode(error) })
      .catch(() => false)
    return { kind: 'failed', error, ledgerRecorded: recorded, safeToRetry: safe }
  }

  const recorded = await args.ledger.complete(args.parts, reserved.reservationToken, { outcome: 'succeeded', outcomeRef: externalRef(value) }).catch(() => false)
  return { kind: 'sent', value, ledgerRecorded: recorded }
}

function errorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/[^\w .:/-]/g, '').slice(0, 100) || 'ERROR'
}
function externalRef(v: unknown): string | undefined {
  const id = (v as { externalMessageId?: unknown } | null)?.externalMessageId
  return typeof id === 'string' ? id.slice(0, 200) : undefined
}
