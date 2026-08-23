-- Close the last reply-enqueue race at the table boundary. The auto-reply path
-- already had an auto-vs-auto partial unique index, but a human approval could
-- still race another human approval or an auto sweep and create a separate row.
-- Because claims are per row, separate rows can become separate real DMs.
--
-- The trigger serializes INSERTs per inbox item with a transaction-scoped
-- advisory lock, rejects any second non-cancelled job, and validates that the
-- referenced inbox item/contact/suggestion all belong to the same workspace.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_reply_job_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item_platform public.social_platform;
  v_item_contact_id UUID;
  v_contact_target TEXT;
BEGIN
  SELECT platform, contact_id
  INTO v_item_platform, v_item_contact_id
  FROM public.inbox_items
  WHERE id = NEW.inbox_item_id
    AND workspace_id = NEW.workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reply inbox item does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;

  IF NEW.platform <> v_item_platform THEN
    RAISE EXCEPTION 'Reply platform does not match the inbox item.' USING ERRCODE = '23514';
  END IF;

  IF NEW.contact_id IS NULL OR v_item_contact_id IS DISTINCT FROM NEW.contact_id THEN
    RAISE EXCEPTION 'Reply contact does not match the inbox item.' USING ERRCODE = '23514';
  END IF;

  SELECT external_contact_id
  INTO v_contact_target
  FROM public.messaging_contacts
  WHERE id = NEW.contact_id
    AND workspace_id = NEW.workspace_id;

  IF NOT FOUND OR v_contact_target IS DISTINCT FROM NEW.send_target THEN
    RAISE EXCEPTION 'Reply target does not match the workspace contact.' USING ERRCODE = '23514';
  END IF;

  IF NEW.suggestion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.ai_reply_suggestions
    WHERE id = NEW.suggestion_id
      AND workspace_id = NEW.workspace_id
      AND inbox_item_id = NEW.inbox_item_id
  ) THEN
    RAISE EXCEPTION 'Reply suggestion does not belong to this inbox item.' USING ERRCODE = '23514';
  END IF;

  -- Serialize human/human, auto/auto, and human/auto INSERTs for this inbound
  -- message. Existing failed/sent jobs are also kept as the one durable reply;
  -- the app has a dedicated retry path for failed jobs.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.inbox_item_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.reply_jobs
    WHERE inbox_item_id = NEW.inbox_item_id
      AND status <> 'cancelled'::public.reply_job_status
  ) THEN
    RAISE EXCEPTION 'A non-cancelled reply job already exists for this inbox item.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reply_job_insert ON public.reply_jobs;
CREATE TRIGGER guard_reply_job_insert
  BEFORE INSERT ON public.reply_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reply_job_insert();

COMMENT ON FUNCTION public.guard_reply_job_insert() IS
  'Validates reply-job workspace references and serializes INSERTs so one inbound message cannot acquire multiple non-cancelled outbound reply jobs.';

COMMIT;
