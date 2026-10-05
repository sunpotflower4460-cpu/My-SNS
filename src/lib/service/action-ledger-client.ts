/**
 * Client for the Artist OS Action Ledger (cross-system external-write coordination).
 * Dependency-free (fetch injected) so it can be exercised against the real Artist OS app in tests.
 *
 * Every transport problem is surfaced as LEDGER_UNAVAILABLE: callers in managed mode must
 * then NOT send. The token only travels as a Bearer header and is never logged.
 */
export interface ActionKeyParts {
  platform: string
  operation: 'comment_reply' | 'dm_reply' | 'mention_reply'
  externalEventId: string
}

export type LedgerReserveResult =
  | { status: 'ACQUIRED'; reservationToken: string }
  | { status: 'ALREADY_RESERVED' | 'ALREADY_SUCCEEDED' | 'OUTCOME_UNKNOWN' | 'CONFLICT'; detail?: string }
  | { status: 'LEDGER_UNAVAILABLE'; detail: string }

export interface LedgerPort {
  reserve(parts: ActionKeyParts): Promise<LedgerReserveResult>
  begin(parts: ActionKeyParts, reservationToken: string): Promise<boolean>
  complete(
    parts: ActionKeyParts,
    reservationToken: string,
    outcome: { outcome: 'succeeded'; outcomeRef?: string } | { outcome: 'failed_safe'; failureCode: string } | { outcome: 'unknown'; reason: string },
  ): Promise<boolean>
}

export interface LedgerClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function ledgerClientFromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: typeof fetch): LedgerPort | null {
  const baseUrl = env.ARTIST_OS_LEDGER_URL?.trim()
  const token = env.ARTIST_OS_LEDGER_TOKEN?.trim()
  if (!baseUrl || !token) return null
  return new HttpLedgerClient({ baseUrl, token, fetchImpl })
}

export class HttpLedgerClient implements LedgerPort {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  constructor(private readonly opts: LedgerClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.timeoutMs = opts.timeoutMs ?? 5000
  }

  private async post(path: string, body: unknown): Promise<{ ok: true; status: number; json: Record<string, unknown> } | { ok: false; detail: string }> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(new URL(path, this.opts.baseUrl).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.token}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
        redirect: 'error',
      })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      return { ok: true, status: res.status, json: (await res.json()) as Record<string, unknown> }
    } catch {
      return { ok: false, detail: 'request failed or timed out' }
    } finally {
      clearTimeout(timer)
    }
  }

  async reserve(parts: ActionKeyParts): Promise<LedgerReserveResult> {
    const r = await this.post('/api/ledger/reserve', parts)
    if (!r.ok) return { status: 'LEDGER_UNAVAILABLE', detail: r.detail }
    const s = r.json.status
    if (s === 'ACQUIRED' && typeof r.json.reservationToken === 'string') return { status: 'ACQUIRED', reservationToken: r.json.reservationToken }
    if (s === 'ALREADY_RESERVED' || s === 'ALREADY_SUCCEEDED' || s === 'OUTCOME_UNKNOWN' || s === 'CONFLICT') {
      return { status: s, detail: typeof r.json.reason === 'string' ? r.json.reason : undefined }
    }
    // An answer we do not understand is NOT permission to send.
    return { status: 'LEDGER_UNAVAILABLE', detail: 'unrecognized ledger response' }
  }

  async begin(parts: ActionKeyParts, reservationToken: string): Promise<boolean> {
    const r = await this.post('/api/ledger/begin', { ...parts, reservationToken })
    return r.ok && r.json.ok === true
  }

  async complete(parts: ActionKeyParts, reservationToken: string, outcome: Parameters<LedgerPort['complete']>[2]): Promise<boolean> {
    const r = await this.post('/api/ledger/complete', { ...parts, reservationToken, ...outcome })
    return r.ok && r.json.ok === true
  }
}
