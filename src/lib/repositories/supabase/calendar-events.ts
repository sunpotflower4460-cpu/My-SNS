import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent, CalendarEventInput } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface CalendarEventRow {
  id: string
  workspace_id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  source: 'manual' | 'extracted'
  inbox_item_id: string | null
  contact_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export function mapCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    allDay: row.all_day,
    location: row.location ?? undefined,
    source: row.source,
    inboxItemId: row.inbox_item_id ?? undefined,
    contactId: row.contact_id ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listWorkspaceCalendarEvents(workspaceId: string): Promise<CalendarEvent[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('starts_at', { ascending: true })

  if (error) {
    console.error('Error fetching calendar events:', error)
    return []
  }

  return (data ?? []).map((row) => mapCalendarEvent(row as CalendarEventRow))
}

function toRowValues(input: CalendarEventInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    all_day: input.allDay ?? false,
    location: input.location?.trim() || null,
    source: input.source ?? 'manual',
    inbox_item_id: input.inboxItemId ?? null,
    contact_id: input.contactId ?? null,
  }
}

/**
 * Creates an event. Takes an explicit client so it can run either from the app
 * (the acting user's browser client — RLS pins created_by = auth.uid()) or,
 * later, from the approval step that promotes an extracted proposal.
 */
export async function createCalendarEvent(
  supabase: SupabaseClient,
  params: { workspaceId: string; createdBy: string; input: CalendarEventInput },
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({ ...toRowValues(params.input), workspace_id: params.workspaceId, created_by: params.createdBy })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapCalendarEvent(data as CalendarEventRow)
}

export async function updateCalendarEvent(workspaceId: string, eventId: string, input: CalendarEventInput): Promise<CalendarEvent> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('calendar_events')
    .update(toRowValues(input))
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapCalendarEvent(data as CalendarEventRow)
}

export async function deleteCalendarEvent(workspaceId: string, eventId: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId).eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
}
