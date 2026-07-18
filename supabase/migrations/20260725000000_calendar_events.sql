-- Phase 3 (messaging concierge): an in-app calendar.
--
-- Decisions the concierge makes with a contact — "let's meet Tuesday 3pm",
-- "I'll send it next week" — need somewhere to live. This is that surface: a
-- workspace calendar the creator manages directly now, and that a later
-- approval-based schedule-extraction step (propose_schedule) writes into only
-- after the human confirms. Nothing writes here automatically — source tracks
-- whether a row was entered by hand or promoted from an extracted proposal.
--
-- A later phase syncs these to Notion / TimeTree; this table is the source of
-- truth the app owns first.

BEGIN;

CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  -- Optional end; an all-day or open-ended event may have none.
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  -- manual = entered by a human; extracted = promoted from an AI schedule
  -- proposal AFTER human approval (never written without confirmation).
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted')),
  -- Provenance for an extracted event: the DM it came from and who it's with.
  -- SET NULL so pruning an inbox item / contact never deletes a real calendar entry.
  inbox_item_id UUID REFERENCES public.inbox_items(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.messaging_contacts(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_end_after_start CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX calendar_events_workspace_id_idx ON public.calendar_events(workspace_id);
CREATE INDEX calendar_events_starts_at_idx ON public.calendar_events(starts_at);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SELECT: any member. INSERT/UPDATE/DELETE: owner/admin/editor (the roles that
-- hold manage_calendar in src/lib/permissions), matching how the app gates the
-- calendar actions. INSERT also pins created_by to the acting user.
CREATE POLICY "Members can read calendar events"
  ON public.calendar_events FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Editors can create calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
    AND created_by = auth.uid()
  );

CREATE POLICY "Editors can update calendar events"
  ON public.calendar_events FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "Editors can delete calendar events"
  ON public.calendar_events FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

COMMENT ON TABLE public.calendar_events IS
  'The workspace in-app calendar. source=extracted rows are promoted from AI schedule proposals only after human approval; nothing is written here automatically.';

COMMIT;
