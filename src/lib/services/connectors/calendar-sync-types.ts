// Phase 4 (external calendar sync) — the fail-closed contract shared by the
// Notion and TimeTree connectors. Like the LINE connector, credentials live in
// env vars (a long-lived integration token / OAuth token issued in the
// provider's console); until they're set, every connector refuses rather than
// pretending a sync happened.

export type CalendarSyncProvider = 'notion' | 'timetree'

/** The event content a connector pushes to an external calendar. */
export interface CalendarSyncEvent {
  title: string
  description?: string
  /** Absolute UTC ISO. */
  startsAt: string
  /** Absolute UTC ISO; absent for an open-ended event. */
  endsAt?: string
  allDay: boolean
  location?: string
}

export interface CalendarSyncResult {
  provider: CalendarSyncProvider
  /** The provider's own id for the created entry, when it returns one. */
  externalId?: string
  externalUrl?: string
}

/**
 * A one-way push of a single event into an external calendar. An unconfigured
 * connector throws (fail closed) — it never returns a fake success. Real
 * two-way sync / dedupe is out of scope for this scaffolding.
 */
export interface CalendarSyncConnector {
  readonly provider: CalendarSyncProvider
  isConfigured(): boolean
  syncEvent(event: CalendarSyncEvent): Promise<CalendarSyncResult>
}
