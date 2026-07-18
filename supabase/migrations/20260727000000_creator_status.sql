-- Phase 5 (messaging concierge): the creator's current mood / availability, so
-- the concierge can convey it to contacts when it helps ("this week is a bit
-- busy, so my reply may be slower"). One row per creator per workspace; the
-- creator manages only their own. share_with_contacts gates whether the AI may
-- surface it at all — off means it stays private and never reaches a reply.

BEGIN;

CREATE TABLE public.creator_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- A short label for the current state (e.g. 忙しい, 落ち着いている, 旅行中, 体調不良).
  mood TEXT NOT NULL,
  -- Optional free-text detail the creator wants available to the concierge.
  note TEXT,
  -- Whether the AI may convey this to contacts when relevant. Off = private.
  share_with_contacts BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX creator_status_workspace_id_idx ON public.creator_status(workspace_id);

ALTER TABLE public.creator_status ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_creator_status_updated_at
  BEFORE UPDATE ON public.creator_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A creator's status is personal: they read and write only their own row, and
-- only within a workspace they belong to. No one else can read it directly (the
-- concierge conveys it on their behalf server-side, it is never exposed to other
-- members through this table).
CREATE POLICY "Users read their own status"
  ON public.creator_status FOR SELECT
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE POLICY "Users insert their own status"
  ON public.creator_status FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE POLICY "Users update their own status"
  ON public.creator_status FOR UPDATE
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE POLICY "Users delete their own status"
  ON public.creator_status FOR DELETE
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

COMMENT ON TABLE public.creator_status IS
  'The creator''s current mood/availability, conveyed to contacts by the concierge only when share_with_contacts is true. One row per creator per workspace; RLS-scoped to the owner of the row.';

COMMIT;
