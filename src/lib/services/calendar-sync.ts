import type { CalendarSyncConnector, CalendarSyncEvent, CalendarSyncProvider, CalendarSyncResult } from './connectors/calendar-sync-types'
import { NotionCalendarConnector } from './connectors/notion-calendar'
import { TimeTreeCalendarConnector } from './connectors/timetree-calendar'

// Phase 4 orchestration: push one event to every EXTERNAL calendar the workspace
// has configured (via env). Honest and fail-closed — a provider that isn't
// configured is reported as 'unavailable', never silently skipped as success,
// and never faked. Real sync only happens once the human sets the provider's
// tokens; until then this is inert scaffolding.

const CONNECTORS: CalendarSyncConnector[] = [new NotionCalendarConnector(), new TimeTreeCalendarConnector()]

export const CALENDAR_SYNC_PROVIDERS = CONNECTORS.map((connector) => connector.provider)

export interface ProviderSyncOutcome {
  provider: CalendarSyncProvider
  status: 'synced' | 'unavailable' | 'failed'
  externalId?: string
  externalUrl?: string
  error?: string
}

/** The providers that are actually configured right now (both env vars present). */
export function configuredCalendarSyncProviders(): CalendarSyncProvider[] {
  return CONNECTORS.filter((c) => c.isConfigured()).map((c) => c.provider)
}

/**
 * Attempts to sync one event to the requested providers. Never throws — each
 * provider's outcome is reported independently, so one failing provider doesn't
 * hide another's success. When providers is omitted, preserves the original
 * all-provider behaviour including explicit unavailable outcomes.
 */
export async function syncEventToProviders(
  event: CalendarSyncEvent,
  providers?: CalendarSyncProvider[],
): Promise<ProviderSyncOutcome[]> {
  const requested = providers ? new Set(providers) : null
  const connectors = requested ? CONNECTORS.filter((connector) => requested.has(connector.provider)) : CONNECTORS

  return Promise.all(
    connectors.map(async (connector): Promise<ProviderSyncOutcome> => {
      if (!connector.isConfigured()) {
        return { provider: connector.provider, status: 'unavailable' }
      }
      try {
        const result: CalendarSyncResult = await connector.syncEvent(event)
        return { provider: connector.provider, status: 'synced', externalId: result.externalId, externalUrl: result.externalUrl }
      } catch (cause) {
        return { provider: connector.provider, status: 'failed', error: cause instanceof Error ? cause.message : '同期に失敗しました。' }
      }
    }),
  )
}
