-- A Worker claim only proves that one request owns the job right now. It does
-- not prove whether an external create/publish call has already started. If a
-- platform confirms a post and the database then becomes completely unavailable,
-- neither the success attempt nor status='published' can be persisted. A plain
-- stale-claim reclaim would later publish the immutable Revision a second time.
--
-- Persist an irreversible-call fence immediately before the adapter call. Once
-- this timestamp exists, automatic stale reclaim/retry is forbidden unless the
-- same owning Worker durably records that the provider rejected the operation
-- before any ambiguous side effect. This deliberately prefers a human reconcile
-- over a duplicate public post.

BEGIN;

ALTER TABLE public.publish_jobs
  ADD COLUMN IF NOT EXISTS external_call_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.publish_jobs.external_call_started_at IS
  'Durable fence set by the service-role Worker immediately before an irreversible platform publish call. A non-null fence blocks automatic replay after an abandoned/ambiguous Worker.';

-- Keep the existing Revision/provenance and unsafe-result tombstone rules, and
-- additionally make an external-call fence a permanent no-reschedule tombstone
-- for this exact immutable Revision even when the job is later cancelled.
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
  v_old_unsafe BOOLEAN :=
    v_old_error LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
    OR v_old_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%';
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

  -- The irreversible-call fence is Worker-owned state. Authenticated clients
  -- may inspect it through normal SELECT, but may not forge or erase it to make
  -- an ambiguous operation retryable. Service-role code is still constrained by
  -- the retry/state rules below.
  IF NEW.external_call_started_at IS DISTINCT FROM OLD.external_call_started_at
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
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
  'Validates immutable Revision provenance and prevents reusing a Revision after any ambiguous/started external publish operation.';
COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Keeps publish provenance/terminal-state invariants, preserves unsafe markers, and protects the service-managed irreversible external-call fence.';

COMMIT;
