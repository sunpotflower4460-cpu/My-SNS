-- Closing a failed job must not become an escape hatch around the external-
-- result safety guard. If a connector reported that a post definitely exists
-- partially, or may already exist because the response was lost, cancelling
-- that job is useful for queue cleanup but the SAME immutable Revision must
-- never be scheduled again. Repair intentionally requires a fresh Revision so
-- a human has to make an explicit new approval decision after inspecting the
-- platform.

BEGIN;

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

  -- Normal cancelled jobs are replaceable. Unsafe external-result jobs remain
  -- a permanent tombstone for this Revision even after cancellation: allowing
  -- a replacement would be equivalent to retrying an operation that may
  -- already exist on the platform.
  IF EXISTS (
    SELECT 1
    FROM public.publish_jobs
    WHERE revision_id = NEW.revision_id
      AND (
        status <> 'cancelled'::public.publish_job_status
        OR COALESCE(error_message, '') LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
        OR COALESCE(error_message, '') LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
      )
  ) THEN
    RAISE EXCEPTION 'This Revision already has a publish job, or a previous external result was unsafe to repeat. Inspect the platform and create a fresh Revision before publishing again.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_publish_job_insert() IS
  'Validates immutable Revision provenance, serializes scheduling, and keeps partial/unknown external-result jobs as permanent no-reschedule tombstones for that Revision even after cancellation.';

COMMIT;
