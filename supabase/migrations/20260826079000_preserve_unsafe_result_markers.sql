-- Safety markers are part of the durable state machine, not ordinary editable
-- error copy. If application code or a direct authenticated UPDATE could clear
-- EXTERNAL_RESULT_UNKNOWN / PARTIAL_EXTERNAL_SUCCESS while leaving a failed or
-- cancelled job in place, the later retry/reschedule guards could be bypassed.
-- Keep those markers immutable until an explicit terminal success is recorded.

BEGIN;

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
     AND v_old_unsafe THEN
    RAISE EXCEPTION 'This publish may already exist externally and cannot be retried automatically. Inspect the platform, cancel this job, and create a fresh Revision if repair is needed.' USING ERRCODE = '23514';
  END IF;

  -- Do not let a normal update erase the tombstone that makes future retry and
  -- reschedule checks safe. A human-confirmed/connector-confirmed transition to
  -- published is the one state that may clear the old diagnostic marker.
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

CREATE OR REPLACE FUNCTION public.guard_reply_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_error TEXT := COALESCE(OLD.error_message, '');
  v_old_unsafe BOOLEAN := v_old_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%';
BEGIN
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

  -- A lost/5xx LINE response may still have delivered the message. Preserve
  -- that durable warning through failed/cancelled states so no later code can
  -- silently turn it into an ordinary retryable failure. A confirmed sent
  -- reconciliation may clear it.
  IF v_old_unsafe
     AND NEW.status <> 'sent'::public.reply_job_status
     AND NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'Unknown external reply-result marker cannot be cleared or rewritten before confirmed delivery.' USING ERRCODE = '23514';
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

COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Keeps publish provenance/terminal-state invariants and preserves partial/unknown external-result tombstones until confirmed publication.';
COMMENT ON FUNCTION public.guard_reply_job_update() IS
  'Keeps approved reply content/recipient immutable, protects terminal states, and preserves unknown external-delivery markers until confirmed send.';

COMMIT;
