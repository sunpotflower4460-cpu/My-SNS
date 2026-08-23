-- Protect scheduled publishing at the database boundary. A publish_job carries
-- separate workspace/Seed/draft/Revision ids; ordinary foreign keys prove each
-- row exists, but do not prove they all describe the same approved content.
-- The cron Worker uses service-role reads, so a malformed cross-workspace job
-- must be rejected before it can ever reach an external platform.
--
-- The same guard also serializes scheduling by immutable Revision so a double
-- click / HTTP retry cannot create two independently claimable jobs that would
-- publish the same approved content twice.

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

  -- Serialize inserts for the immutable approval snapshot. A cancelled job may
  -- be replaced, but failed jobs use the existing Retry action and a published
  -- Revision is not silently scheduled again. Re-publishing intentionally
  -- requires a new approval Revision.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.revision_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.publish_jobs
    WHERE revision_id = NEW.revision_id
      AND status <> 'cancelled'::public.publish_job_status
  ) THEN
    RAISE EXCEPTION 'A non-cancelled publish job already exists for this Revision.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_publish_job_insert ON public.publish_jobs;
CREATE TRIGGER guard_publish_job_insert
  BEFORE INSERT ON public.publish_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_publish_job_insert();

COMMENT ON FUNCTION public.guard_publish_job_insert() IS
  'Validates publish job references against the immutable Revision and serializes scheduling so one Revision cannot acquire multiple non-cancelled jobs.';

COMMIT;
