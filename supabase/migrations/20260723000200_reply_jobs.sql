-- Phase 1 (messaging concierge) PR-C: approve-and-send with recipient-appropriate
-- timing. reply_jobs is the messaging-side twin of publish_jobs, and
-- reply_attempts is the twin of publish_attempts — a human approves a suggested
-- reply, the job captures the final approved text as an immutable snapshot plus
-- an absolute UTC scheduled_at (computed at enqueue from the contact's timezone /
-- quiet hours), and the reply Worker later pushes it via the LINE connector.
--
-- Deliberate reuse: the attempt status / failure-reason enums from the publish
-- side (publish_attempt_status / publish_failure_reason) are shared rather than
-- duplicated — a send failure classifies into the same buckets as a publish
-- failure (auth / ratelimit / validation / network / unavailable).

BEGIN;

CREATE TYPE public.reply_send_mode AS ENUM ('scheduled', 'auto');
CREATE TYPE public.reply_job_status AS ENUM ('scheduled', 'sent', 'failed', 'cancelled');

CREATE TABLE public.reply_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- The inbound message this reply answers. CASCADE: if the inbox item is
  -- deleted the pending reply to it is meaningless.
  inbox_item_id UUID NOT NULL REFERENCES public.inbox_items(id) ON DELETE CASCADE,
  -- The conversational contact. SET NULL (not CASCADE) so a contact-row cleanup
  -- never silently drops the send history; send_target below is the durable copy.
  contact_id UUID REFERENCES public.messaging_contacts(id) ON DELETE SET NULL,
  -- The suggestion this reply was approved from, for provenance. SET NULL so
  -- pruning old suggestions never deletes the record that a reply was sent.
  suggestion_id UUID REFERENCES public.ai_reply_suggestions(id) ON DELETE SET NULL,
  platform public.social_platform NOT NULL,
  -- The final, human-approved reply text. Immutable snapshot: editing the
  -- suggestion afterwards must never change what an already-approved job sends
  -- (mirrors publish_jobs.revision_id capturing approved content at schedule time).
  reply_text TEXT NOT NULL,
  -- The platform-native recipient id (LINE userId), copied from the contact at
  -- enqueue so the send target is durable even if the contact row later changes.
  send_target TEXT NOT NULL,
  reply_mode public.reply_send_mode NOT NULL DEFAULT 'scheduled',
  status public.reply_job_status NOT NULL DEFAULT 'scheduled',
  -- Absolute UTC. Computed once at enqueue from the recipient's timezone /
  -- quiet hours (see reply-timing.ts) and then frozen, so the Worker stays
  -- timezone-agnostic exactly like the publish Worker.
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  -- Set atomically when the Worker starts sending; cleared when it finishes.
  -- A claim older than a few minutes is treated as abandoned and reclaimable
  -- (see reply-worker.ts's STALE_CLAIM_MINUTES), same contract as publish_jobs.
  claimed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX reply_jobs_workspace_id_idx ON public.reply_jobs(workspace_id);
CREATE INDEX reply_jobs_inbox_item_id_idx ON public.reply_jobs(inbox_item_id);
CREATE INDEX reply_jobs_status_idx ON public.reply_jobs(status);
CREATE INDEX reply_jobs_scheduled_at_idx ON public.reply_jobs(scheduled_at);

ALTER TABLE public.reply_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read reply jobs"
  ON public.reply_jobs FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- INSERT/UPDATE gated to the roles that hold reply_inbox (owner/admin/editor),
-- matching the /api/inbox/reply/approve route's permission check. The Worker
-- itself uses the service-role key, which bypasses RLS, so it needs no policy.
CREATE POLICY "Repliers can create reply jobs"
  ON public.reply_jobs FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
    AND created_by = auth.uid()
  );

CREATE POLICY "Repliers can update reply jobs"
  ON public.reply_jobs FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

COMMENT ON TABLE public.reply_jobs IS
  'One approved outbound DM reply awaiting or past its scheduled send. reply_text and send_target are immutable snapshots captured at approval; scheduled_at is absolute UTC computed from the recipient timezone/quiet-hours at enqueue.';

-- ============================================================================
-- reply_attempts: append-only history of every send attempt for a reply_job,
-- the exact twin of publish_attempts. Never updated or deleted — a re-send is
-- always a new row. external_message_id holds the platform's own id
-- (LINE x-line-request-id) when the send returns one.
-- ============================================================================
CREATE TABLE public.reply_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reply_job_id UUID NOT NULL REFERENCES public.reply_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status public.publish_attempt_status NOT NULL,
  failure_reason public.publish_failure_reason,
  error_message TEXT,
  external_message_id TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reply_attempts_attempt_number_positive CHECK (attempt_number > 0),
  CONSTRAINT reply_attempts_failure_reason_requires_failed CHECK (
    (status = 'failed' AND failure_reason IS NOT NULL) OR (status = 'success' AND failure_reason IS NULL)
  ),
  UNIQUE (reply_job_id, attempt_number)
);

CREATE INDEX reply_attempts_workspace_id_idx ON public.reply_attempts(workspace_id);
CREATE INDEX reply_attempts_reply_job_id_idx ON public.reply_attempts(reply_job_id);

ALTER TABLE public.reply_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read reply attempts"
  ON public.reply_attempts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- The Worker (service role) bypasses RLS. No user-facing INSERT path exists —
-- a reply attempt is only ever recorded by the Worker — so there is
-- deliberately no INSERT policy here (unlike publish_attempts, which a human
-- can write via "Mark as posted"; there is no manual-completion for a DM send).

COMMENT ON TABLE public.reply_attempts IS
  'Append-only send-attempt history for a reply_job. Shares the publish attempt-status / failure-reason enums. external_message_id is the platform request id when the send returns one.';

COMMIT;
