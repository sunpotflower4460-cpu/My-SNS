-- Some connector failures are unsafe to retry from the beginning:
-- 1) PARTIAL_EXTERNAL_SUCCESS: at least one irreversible external side effect
--    definitely happened (for example tweet 1 of an X thread exists).
-- 2) EXTERNAL_RESULT_UNKNOWN: the request crossed the external side-effect
--    boundary but the client lost/received an unusable response, so success is
--    uncertain. Retrying blindly can duplicate a real post.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_publish_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_error TEXT := COALESCE(OLD.error_message, '');
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
     AND (
       v_error LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
       OR v_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
     ) THEN
    RAISE EXCEPTION 'This publish may already exist externally and cannot be retried automatically. Inspect the platform, cancel this job, and create a fresh Revision if repair is needed.' USING ERRCODE = '23514';
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

COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Keeps publish provenance immutable, prevents terminal reactivation, and blocks automatic retry when a connector reports partial success or an uncertain external result.';

COMMIT;
