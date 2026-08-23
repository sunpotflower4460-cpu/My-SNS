-- Strengthen the reply-job contract after the enqueue race guard. reply_jobs is
-- an approved outbound side effect: the text, recipient and schedule captured
-- at approval must not be mutable through a direct table UPDATE, and an auto
-- job must never be inserted for a contact that has not opted into auto-send.

BEGIN;

-- Replace the insert guard with the same serialization/provenance checks plus
-- send-enabled platform and auto-send opt-in invariants.
CREATE OR REPLACE FUNCTION public.guard_reply_job_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item_platform public.social_platform;
  v_item_contact_id UUID;
  v_contact_target TEXT;
  v_auto_send_enabled BOOLEAN;
BEGIN
  IF NEW.reply_text IS NULL OR length(btrim(NEW.reply_text)) = 0 THEN
    RAISE EXCEPTION 'Reply text must not be blank.' USING ERRCODE = '23514';
  END IF;
  IF NEW.send_target IS NULL OR length(btrim(NEW.send_target)) = 0 THEN
    RAISE EXCEPTION 'Reply send target must not be blank.' USING ERRCODE = '23514';
  END IF;

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

  -- Phase 1 has one real outbound messaging connector: LINE. The API already
  -- enforces this; keep the database/cron boundary equally fail-closed.
  IF NEW.platform <> 'line'::public.social_platform THEN
    RAISE EXCEPTION 'This messaging platform is not send-enabled.' USING ERRCODE = '23514';
  END IF;

  IF NEW.contact_id IS NULL OR v_item_contact_id IS DISTINCT FROM NEW.contact_id THEN
    RAISE EXCEPTION 'Reply contact does not match the inbox item.' USING ERRCODE = '23514';
  END IF;

  SELECT external_contact_id, auto_send_enabled
  INTO v_contact_target, v_auto_send_enabled
  FROM public.messaging_contacts
  WHERE id = NEW.contact_id
    AND workspace_id = NEW.workspace_id;

  IF NOT FOUND OR v_contact_target IS DISTINCT FROM NEW.send_target THEN
    RAISE EXCEPTION 'Reply target does not match the workspace contact.' USING ERRCODE = '23514';
  END IF;

  IF NEW.reply_mode = 'auto'::public.reply_send_mode AND NOT COALESCE(v_auto_send_enabled, FALSE) THEN
    RAISE EXCEPTION 'Auto reply is not enabled for this contact.' USING ERRCODE = '23514';
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

  -- Serialize human/human, auto/auto and human/auto INSERTs for this inbound
  -- message. Failed jobs remain the durable job and use the retry path.
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

CREATE OR REPLACE FUNCTION public.guard_reply_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The approved outbound snapshot is immutable. contact_id/suggestion_id are
  -- allowed to become NULL only because their foreign keys deliberately use
  -- ON DELETE SET NULL; the durable send_target and reply_text remain frozen.
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.inbox_item_id IS DISTINCT FROM OLD.inbox_item_id
     OR NEW.platform IS DISTINCT FROM OLD.platform
     OR NEW.reply_text IS DISTINCT FROM OLD.reply_text
     OR NEW.send_target IS DISTINCT FROM OLD.send_target
     OR NEW.reply_mode IS DISTINCT FROM OLD.reply_mode
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Reply job approved content and recipient are immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND NEW.contact_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reply job contact may only be cleared by referential cleanup.' USING ERRCODE = '23514';
  END IF;
  IF NEW.suggestion_id IS DISTINCT FROM OLD.suggestion_id AND NEW.suggestion_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reply job suggestion may only be cleared by referential cleanup.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'sent'::public.reply_job_status
     AND NEW.status <> 'sent'::public.reply_job_status THEN
    RAISE EXCEPTION 'A sent reply cannot leave the sent state.' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'cancelled'::public.reply_job_status
     AND NEW.status <> 'cancelled'::public.reply_job_status THEN
    RAISE EXCEPTION 'A cancelled reply cannot be reactivated.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'scheduled'::public.reply_job_status
     AND NEW.status NOT IN ('scheduled', 'sent', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid reply transition from scheduled.' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'failed'::public.reply_job_status
     AND NEW.status NOT IN ('failed', 'sent', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid reply transition from failed.' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'sent'::public.reply_job_status AND NEW.sent_at IS NULL THEN
    RAISE EXCEPTION 'A sent reply requires sent_at.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reply_job_update ON public.reply_jobs;
CREATE TRIGGER guard_reply_job_update
  BEFORE UPDATE ON public.reply_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reply_job_update();

COMMENT ON FUNCTION public.guard_reply_job_update() IS
  'Keeps the approved reply text/recipient/schedule immutable and prevents sent/cancelled jobs from being reactivated.';

COMMIT;
