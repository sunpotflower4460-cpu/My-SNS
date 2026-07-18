-- Phase 1 (messaging concierge): conversation/contact grouping for the inbox.
--
-- A messaging_contacts row is one person the workspace converses with on one
-- platform (LINE userId / Instagram PSID). It is the SEND target for replies
-- and the anchor for per-contact settings (timezone, quiet hours) and, in a
-- later phase, per-contact learning. The service-role ingestion path upserts
-- these rows; the user may edit timezone / quiet-hours / priority.

BEGIN;

CREATE TABLE public.messaging_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  external_contact_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT,
  quiet_hours_start SMALLINT CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end SMALLINT CHECK (quiet_hours_end BETWEEN 0 AND 23),
  priority_hint TEXT CHECK (priority_hint IN ('high', 'normal', 'low')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, platform, external_contact_id)
);

CREATE INDEX messaging_contacts_workspace_id_idx ON public.messaging_contacts(workspace_id);

ALTER TABLE public.messaging_contacts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_messaging_contacts_updated_at
  BEFORE UPDATE ON public.messaging_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SELECT: any member. UPDATE: owner/admin/editor (so a human can set a
-- contact's timezone / quiet-hours / priority). There is deliberately NO
-- INSERT policy — rows are created only by the service-role webhook ingestion
-- path, exactly like inbox_items.
CREATE POLICY "Members can read messaging contacts"
  ON public.messaging_contacts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Editors can update messaging contacts"
  ON public.messaging_contacts FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

COMMENT ON TABLE public.messaging_contacts IS
  'One conversational contact on one platform (LINE userId / Instagram PSID). external_contact_id is the reply send-target. Rows are upserted by the service-role webhook ingestion; there is deliberately no user INSERT policy.';

-- Link inbox items to their contact, and carry the AI-judged reply urgency
-- used to order the inbox. Both columns are written only by server /
-- service-role code (webhook ingestion sets contact_id; the reply-generate
-- route sets ai_priority), so no new user-facing write policy is needed.
ALTER TABLE public.inbox_items
  ADD COLUMN contact_id UUID REFERENCES public.messaging_contacts(id) ON DELETE SET NULL,
  ADD COLUMN ai_priority TEXT CHECK (ai_priority IN ('high', 'normal', 'low'));

CREATE INDEX inbox_items_contact_id_idx ON public.inbox_items(contact_id);

COMMENT ON COLUMN public.inbox_items.ai_priority IS
  'AI-judged reply urgency (high/normal/low) written by the reply-generate route (service role). Used to order the inbox; null until a suggestion is generated.';

COMMIT;
