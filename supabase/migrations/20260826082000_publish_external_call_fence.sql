-- A Worker claim proves that one request owns the job right now, but without a
-- durable phase marker it cannot tell a later Worker whether the previous
-- request had already reached an irreversible external publish call. If a
-- platform accepts a post and the database then becomes completely unavailable,
-- neither the success attempt nor status='published' can be persisted. A plain
-- stale-claim reclaim would later publish the immutable Revision a second time.
--
-- Fence every service-role Worker claim conservatively BEFORE it can reach the
-- platform. The same Worker clears the fence only when it durably records a
-- provider rejection that is safe to retry. If the process/database disappears
-- anywhere after claim acquisition, the fence survives and stale reclaim is
-- suppressed. This intentionally trades rare manual reconciliation for never
-- blindly duplicating a public post.

BEGIN;

ALTER TABLE public.publish_jobs
  ADD COLUMN IF NOT EXISTS external_call_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.publish_jobs.external_call_started_at IS
  'Conservative irreversible-side-effect fence automatically set when the service-role Worker claims a job. Cleared only after a durably recorded safe provider rejection; otherwise blocks automatic replay.';

-- Deployment-race repair: a Worker may already be in flight when this migration
-- is applied, so that claim could not have passed through the new trigger yet.
-- Conservatively fence every currently claimed row at its existing claim time.
-- This can strand a pre-call crash for manual inspection, but cannot duplicate a
-- post; that is the intended safety trade-off during rollout.
UPDATE public.publish_jobs
SET external_call_started_at = claimed_at
WHERE claimed_at IS NOT NULL
  AND external_call_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_publish_job_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_workspace_id UUID;
  v_revision_seed_id UUID;
  v_revision_draft_id UUID;
  v_revision_channel public.publishing_channel;
BEGIN
  SELECT workspace_id, seed_id, social_draft_id, channel
  INTO v_revision_workspace_id, v_revision_seed_id, v_revision_draft_id, v_revision_channel
  FROM public.draft_revisions
  WHERE id = NEW.revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publish Revision does not exist or is not visible.' USING ERRCODE = '23503';
  END IF;

  IF v_revision_workspace_id IS DISTINCT FROM NEW.workspace_id
     OR v_revision_seed_id IS DISTINCT FROM NEW.seed_id
     OR v_revision_draft_id IS DISTINCT FROM NEW.draft_id
     OR v_revision_channel IS DISTINCT FROM NEW.channel THEN
    RAISE EXCEPTION 'Publish job references do not match the approved Revision.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.revision_id::TEXT, 0)
  );

  -- A cancelled job is ordinarily replaceable, but once a Worker ever entered
  -- the side-effect phase for this immutable Revision, the Revision becomes a
  -- permanent tombstone. Repair requires a fresh human approval Revision.
  IF EXISTS (
    SELECT 1
    FROM public.publish_jobs
    WHERE revision_id = NEW.revision_id
      AND (
        status <> 'cancelled'::public.publish_job_status
        OR external_call_started_at IS NOT NULL
        OR COALESCE(error_message, '') LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
        OR COALESCE(error_message, '') LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
      )
  ) THEN
    RAISE EXCEPTION 'This Revision already has a publish job or may already have reached the external platform. Inspect the platform and create a fresh Revision before publishing again.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_publish_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_error TEXT := COALESCE(OLD.error_message, '');
  v_new_error TEXT := COALESCE(NEW.error_message, '');
  v_old_unsafe BOOLEAN :=
    v_old_error LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
    OR v_old_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%';
  v_new_unsafe BOOLEAN :=
    v_new_error LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
    OR v_new_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%';
  v_new_claim BOOLEAN :=
    NEW.claim_token IS NOT NULL
    AND NEW.claim_token IS DISTINCT FROM OLD.claim_token;
  v_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.seed_id IS DISTINCT FROM OLD.seed_id
     OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
     OR NEW.revision_id IS DISTINCT FROM OLD.revision_id
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.publish_mode IS DISTINCT FROM OLD.publish_mode
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Publish job provenance is immutable after scheduling.' USING ERRCODE = '23514';
  END IF;

  -- Only the server Worker is allowed to acquire an execution claim. Existing
  -- application code already uses service role for Worker processing; making
  -- this explicit prevents a direct authenticated UPDATE from manufacturing a
  -- claim and therefore a side-effect fence.
  IF v_new_claim AND NOT v_service_role THEN
    RAISE EXCEPTION 'Publish Worker claims are service-managed.' USING ERRCODE = '42501';
  END IF;

  IF v_new_claim THEN
    -- A non-null fence means an older Worker vanished after entering the phase
    -- where an external post may have been created. Silently suppress the stale
    -- reclaim (RETURN NULL => UPDATE affects zero rows) so processPublishJob
    -- reports a skipped claim rather than issuing another platform create.
    IF OLD.external_call_started_at IS NOT NULL THEN
      RETURN NULL;
    END IF;

    NEW.external_call_started_at := NOW();
  END IF;

  -- A service Worker may clear its own conservative fence only while durably
  -- transitioning to an ordinary failed result whose provider response proves
  -- retry is safe. Unknown/partial-result markers deliberately retain it.
  IF v_service_role
     AND OLD.external_call_started_at IS NOT NULL
     AND NEW.status = 'failed'::public.publish_job_status
     AND NEW.claim_token IS NULL
     AND NOT v_new_unsafe THEN
    NEW.external_call_started_at := NULL;
  END IF;

  -- Authenticated callers cannot forge/erase the fence directly. The trigger's
  -- own assignments above happen after this input check and are service-owned.
  IF NEW.external_call_started_at IS DISTINCT FROM OLD.external_call_started_at
     AND NOT v_service_role
     AND NOT v_new_claim THEN
    RAISE EXCEPTION 'External publish-call fence is service-managed.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'published'::public.publish_job_status
     AND NEW.status <> 'published'::public.publish_job_status THEN
    RAISE EXCEPTION 'A published job cannot leave the published state.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'cancelled'::public.publish_job_status
     AND NEW.status <> 'cancelled'::public.publish_job_status THEN
    RAISE EXCEPTION 'A cancelled job cannot be reactivated.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'failed'::public.publish_job_status
     AND NEW.status = 'scheduled'::public.publish_job_status
     AND (v_old_unsafe OR OLD.external_call_started_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This publish may already exist externally and cannot be retried automatically. Inspect the platform, cancel this job, and create a fresh Revision if repair is needed.' USING ERRCODE = '23514';
  END IF;

  IF v_old_unsafe
     AND NEW.status <> 'published'::public.publish_job_status
     AND NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'Unsafe external-result markers cannot be cleared or rewritten before confirmed publication.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'draft'::public.publish_job_status
     AND NEW.status NOT IN ('draft', 'published', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid publish job transition from draft.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'scheduled'::public.publish_job_status
     AND NEW.status NOT IN ('scheduled', 'published', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid publish job transition from scheduled.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'failed'::public.publish_job_status
     AND NEW.status NOT IN ('failed', 'scheduled', 'published', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid publish job transition from failed.' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'published'::public.publish_job_status AND NEW.published_at IS NULL THEN
    RAISE EXCEPTION 'A published job requires published_at.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_publish_job_insert() IS
  'Validates immutable Revision provenance and prevents reusing a Revision after any fenced/ambiguous external publish operation.';
COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Automatically fences service-role publish claims, suppresses ambiguous stale reclaim, preserves unsafe markers, and clears the fence only for durably safe provider rejection.';

COMMIT;
