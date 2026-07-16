BEGIN;

CREATE TYPE public.notification_type AS ENUM ('draft_needs_approval', 'publish_failed', 'inbox_needs_action');

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- The recipient, not the actor who triggered it — e.g. for
  -- draft_needs_approval this is an approver, not the person who generated
  -- the draft.
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  target_type TEXT,
  target_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX notifications_workspace_id_idx ON public.notifications (workspace_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Also requires current membership in workspace_id, matching every other
-- RLS-protected table in this schema (see is_workspace_member() usage
-- throughout 20260421000001_rls_policies.sql) — without it, a user removed
-- from a workspace would keep indefinite read access to notification
-- content (including truncated publish-failure error text) from a
-- workspace they no longer belong to, since user_id alone never changes.
CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() AND is_workspace_member(workspace_id));

CREATE POLICY "Users can mark their own notifications read"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() AND is_workspace_member(workspace_id))
  WITH CHECK (user_id = auth.uid() AND is_workspace_member(workspace_id));

-- Deliberately allows inserting a notification for *any* user_id, not just
-- auth.uid() — this table exists specifically to notify someone else (an
-- approver, a teammate). Scoped only to "the actor is actually a member of
-- this workspace", the same trust level already given to audit_logs and
-- inbox_notes authorship. A malicious member could still write a misleading
-- title/body to a real teammate, same as they already could via inbox_notes.
CREATE POLICY "Workspace members can create notifications for teammates"
  ON public.notifications FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

COMMIT;
