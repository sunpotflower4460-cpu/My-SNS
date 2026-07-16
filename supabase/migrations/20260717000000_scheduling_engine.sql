-- PR3: Scheduling Engine.
-- Adds publish_mode + an authoritative Revision link to publish_jobs, an
-- append-only publish_attempts history table, and tightens publish_jobs
-- RLS to match the manage_queue/approve_publishing permission model
-- (owner/admin only — editors can approve a draft but not schedule/publish
-- it, matching src/lib/permissions/index.ts).

BEGIN;

CREATE TYPE public.publish_mode AS ENUM ('auto', 'assisted', 'draft', 'manual', 'owned');
CREATE TYPE public.publish_attempt_status AS ENUM ('success', 'failed');
CREATE TYPE public.publish_failure_reason AS ENUM ('auth', 'ratelimit', 'validation', 'network', 'unavailable');

ALTER TABLE public.publish_jobs
  ADD COLUMN publish_mode public.publish_mode NOT NULL DEFAULT 'auto',
  -- The exact approved content this job publishes. Captured at schedule
  -- time so a later re-approval of the same draft (a new Revision) never
  -- silently changes what an already-scheduled job will post. NOT NULL is
  -- safe here: no application code has ever inserted a publish_jobs row
  -- before this migration (there was no schedule action yet), so the table
  -- is empty.
  ADD COLUMN revision_id UUID NOT NULL REFERENCES public.draft_revisions(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.publish_jobs.publish_mode IS
  'auto = Worker publishes automatically. assisted/draft = queued, needs a review step before the Worker acts. manual = the Worker never touches it (e.g. note); a human records completion. owned = the creator''s own site/channel.';
COMMENT ON COLUMN public.publish_jobs.revision_id IS
  'The immutable draft_revisions snapshot this job publishes. Never the mutable social_drafts row, which may keep changing after approval.';

-- Tighten to owner/admin only, matching manage_queue/approve_publishing.
-- The previous PR0-era policies also allowed "editor", which is a wider
-- grant than any role actually has for these permissions in the app.
DROP POLICY IF EXISTS "Editors can create publish jobs" ON public.publish_jobs;
DROP POLICY IF EXISTS "Editors can update publish jobs" ON public.publish_jobs;

CREATE POLICY "Owners and admins can create publish jobs"
  ON public.publish_jobs FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
    AND created_by = auth.uid()
  );

CREATE POLICY "Owners and admins can update publish jobs"
  ON public.publish_jobs FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- ============================================================================
-- publish_attempts: append-only history of every attempt (automatic or
-- manually recorded) to execute a publish_job. Never updated or deleted —
-- retries create a new row rather than mutating the last one.
-- ============================================================================
CREATE TABLE public.publish_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publish_job_id UUID NOT NULL REFERENCES public.publish_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status public.publish_attempt_status NOT NULL,
  failure_reason public.publish_failure_reason,
  error_message TEXT,
  external_post_id TEXT,
  external_url TEXT,
  -- NULL for an automated Worker attempt; set when a human records a
  -- manual completion (e.g. after pasting a note.com draft themselves).
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT publish_attempts_attempt_number_positive CHECK (attempt_number > 0),
  CONSTRAINT publish_attempts_failure_reason_requires_failed CHECK (
    (status = 'failed' AND failure_reason IS NOT NULL) OR (status = 'success' AND failure_reason IS NULL)
  ),
  UNIQUE (publish_job_id, attempt_number)
);

CREATE INDEX publish_attempts_workspace_id_idx ON public.publish_attempts(workspace_id);
CREATE INDEX publish_attempts_publish_job_id_idx ON public.publish_attempts(publish_job_id);

ALTER TABLE public.publish_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read workspace publish attempts"
  ON public.publish_attempts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- Covers a human recording a manual completion from the app. The Worker
-- itself runs with the service role key, which bypasses RLS entirely, so
-- no INSERT policy needs to name it explicitly.
CREATE POLICY "Owners and admins can record publish attempts"
  ON public.publish_attempts FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

COMMENT ON TABLE public.publish_attempts IS
  'Append-only attempt history for a publish_job. failure_reason classifies why an automated attempt failed; a manual completion is recorded as a single successful attempt.';

COMMIT;
