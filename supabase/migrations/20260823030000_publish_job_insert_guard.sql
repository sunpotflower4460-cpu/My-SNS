-- Protect scheduled publishing at the database boundary. A publish_job carries
-- separate workspace/Seed/draft/Revision ids; ordinary foreign keys prove each
-- row exists, but do not prove they all describe the same approved content.
-- The cron Worker uses service-role reads, so a malformed cross-workspace job
-- must be rejected before it can ever reach an external platform.
--
-- The guards also serialize scheduling by immutable Revision and protect the
-- job's immutable provenance / terminal states from direct UPDATE calls.

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

CREATE OR REPLACE FUNCTION public.guard_publish_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- These fields identify exactly what was approved and where it belongs. A
  -- queued job may change execution state/timestamps/errors, never provenance.
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

  -- Terminal states never transition back into a sendable state. Mutable state
  -- transitions mirror the application: failed may retry to scheduled; any
  -- pre-terminal job may fail/publish/cancel; claims keep the same status.
  IF OLD.status = 'published'::public.publish_job_status
     AND NEW.status <> 'published'::public.publish_job_status THEN
    RAISE EXCEPTION 'A published job cannot leave the published state.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'cancelled'::public.publish_job_status
     AND NEW.status <> 'cancelled'::public.publish_job_status THEN
    RAISE EXCEPTION 'A cancelled job cannot be reactivated.' USING ERRCODE = '23514';
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

DROP TRIGGER IF EXISTS guard_publish_job_update ON public.publish_jobs;
CREATE TRIGGER guard_publish_job_update
  BEFORE UPDATE ON public.publish_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_publish_job_update();

COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Keeps scheduled publish provenance immutable and prevents terminal published/cancelled jobs from being reactivated.';

COMMIT;
