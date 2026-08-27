-- Treat TikTok's durable pending-publish marker like other irreversible
-- external-result markers so cancel/reschedule cannot clear the fence and
-- start a second publish while the first publish_id may still complete.

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

  IF EXISTS (
    SELECT 1
    FROM public.publish_jobs
    WHERE revision_id = NEW.revision_id
      AND (
        status <> 'cancelled'::public.publish_job_status
        OR external_call_started_at IS NOT NULL
        OR COALESCE(error_message, '') LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
        OR COALESCE(error_message, '') LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
        OR COALESCE(error_message, '') LIKE 'TIKTOK_PENDING:%'
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
    OR v_old_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
    OR v_old_error LIKE 'TIKTOK_PENDING:%';
  v_new_unsafe BOOLEAN :=
    v_new_error LIKE 'PARTIAL_EXTERNAL_SUCCESS:%'
    OR v_new_error LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
    OR v_new_error LIKE 'TIKTOK_PENDING:%';
  v_new_claim BOOLEAN :=
    NEW.claim_token IS NOT NULL
    AND NEW.claim_token IS DISTINCT FROM OLD.claim_token;
  v_service_role BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
  v_confirmed_success BOOLEAN := FALSE;
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

  IF v_new_claim AND NOT v_service_role THEN
    RAISE EXCEPTION 'Publish Worker claims are service-managed.' USING ERRCODE = '42501';
  END IF;

  IF v_new_claim THEN
    IF OLD.external_call_started_at IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.publish_attempts
        WHERE publish_job_id = OLD.id
          AND status = 'success'::public.publish_attempt_status
      ) INTO v_confirmed_success;

      IF NOT v_confirmed_success THEN
        RETURN NULL;
      END IF;
    ELSE
      NEW.external_call_started_at := NOW();
    END IF;
  END IF;

  IF v_service_role
     AND OLD.external_call_started_at IS NOT NULL
     AND NEW.status = 'published'::public.publish_job_status
     AND NEW.claim_token IS NULL THEN
    NEW.external_call_started_at := NULL;
  ELSIF v_service_role
     AND OLD.external_call_started_at IS NOT NULL
     AND NEW.status = 'failed'::public.publish_job_status
     AND NEW.claim_token IS NULL
     AND NOT v_new_unsafe THEN
    NEW.external_call_started_at := NULL;
  END IF;

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

-- Cancelled EXTERNAL_RESULT_UNKNOWN reply jobs must remain a tombstone for the
-- inbox item: otherwise cancel + re-approve creates a new job UUID and a new
-- LINE X-Line-Retry-Key after the first push may already have been accepted.
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.inbox_item_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.reply_jobs
    WHERE inbox_item_id = NEW.inbox_item_id
      AND (
        status <> 'cancelled'::public.reply_job_status
        OR COALESCE(error_message, '') LIKE 'EXTERNAL_RESULT_UNKNOWN:%'
      )
  ) THEN
    RAISE EXCEPTION 'This inbox item already has a reply job, or a previous LINE result was unsafe to repeat. Inspect LINE before creating another send.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_publish_job_insert() IS
  'Validates Revision provenance and keeps partial/unknown/TikTok-pending external results as permanent no-reschedule tombstones.';
COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Fences service-role publish claims, preserves unsafe markers including TIKTOK_PENDING, and clears the fence only after confirmed publication or a safe rejection.';
COMMENT ON FUNCTION public.guard_reply_job_insert() IS
  'Prevents a second LINE send for an inbox item when a prior EXTERNAL_RESULT_UNKNOWN result may already have delivered.';

COMMIT;
