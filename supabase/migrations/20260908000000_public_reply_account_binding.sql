-- PR #95: public comment replies require provenance and an immutable sender.
-- Existing rows without a verified source account stay read-only. Ingesting a
-- fresh event via a signed Meta webhook or account-scoped YouTube sync sets it.
-- A reconnect never silently changes the account used by a pending reply.
BEGIN;

ALTER TABLE public.inbox_items
  ADD COLUMN social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.reply_jobs
  ADD COLUMN social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL;

CREATE INDEX inbox_items_social_account_id_idx ON public.inbox_items(social_account_id)
  WHERE social_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_inbox_source_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_workspace_id UUID;
  v_platform public.social_platform;
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.platform IS DISTINCT FROM OLD.platform
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.external_id IS DISTINCT FROM OLD.external_id
       OR (OLD.social_account_id IS NOT NULL AND NEW.social_account_id IS NOT NULL
           AND NEW.social_account_id IS DISTINCT FROM OLD.social_account_id)
  ) THEN
    RAISE EXCEPTION 'Inbox source identity is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.social_account_id IS NOT NULL THEN
    SELECT workspace_id, platform INTO v_workspace_id, v_platform
    FROM public.social_accounts WHERE id = NEW.social_account_id;
    IF NOT FOUND OR NEW.workspace_id IS DISTINCT FROM v_workspace_id
       OR NEW.platform IS DISTINCT FROM v_platform THEN
      RAISE EXCEPTION 'Inbox source account does not match its workspace/platform.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_inbox_source_account
  BEFORE INSERT OR UPDATE OF workspace_id, platform, kind, external_id, social_account_id
  ON public.inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_inbox_source_account();

-- Replace the LINE-only guard while preserving its duplicate serialization,
-- unknown-result tombstones, suggestion provenance, and auto-send consent.
CREATE OR REPLACE FUNCTION public.guard_reply_job_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item_platform public.social_platform;
  v_item_kind public.inbox_kind;
  v_item_contact_id UUID;
  v_item_external_id TEXT;
  v_item_account_id UUID;
  v_contact_target TEXT;
  v_auto_send_enabled BOOLEAN;
BEGIN
  IF NEW.reply_text IS NULL OR length(btrim(NEW.reply_text)) = 0 THEN
    RAISE EXCEPTION 'Reply text must not be blank.' USING ERRCODE = '23514';
  END IF;
  IF NEW.send_target IS NULL OR length(btrim(NEW.send_target)) = 0 THEN
    RAISE EXCEPTION 'Reply send target must not be blank.' USING ERRCODE = '23514';
  END IF;

  SELECT platform, kind, contact_id, external_id, social_account_id
  INTO v_item_platform, v_item_kind, v_item_contact_id, v_item_external_id, v_item_account_id
  FROM public.inbox_items
  WHERE id = NEW.inbox_item_id AND workspace_id = NEW.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reply inbox item does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;
  IF NEW.platform IS DISTINCT FROM v_item_platform THEN
    RAISE EXCEPTION 'Reply platform does not match the inbox item.' USING ERRCODE = '23514';
  END IF;

  IF NEW.platform = 'line'::public.social_platform THEN
    IF v_item_kind <> 'dm'::public.inbox_kind THEN
      RAISE EXCEPTION 'LINE send is only supported for DMs.' USING ERRCODE = '23514';
    END IF;
    IF NEW.contact_id IS NULL OR v_item_contact_id IS DISTINCT FROM NEW.contact_id THEN
      RAISE EXCEPTION 'Reply contact does not match the inbox item.' USING ERRCODE = '23514';
    END IF;

    SELECT external_contact_id, auto_send_enabled INTO v_contact_target, v_auto_send_enabled
    FROM public.messaging_contacts
    WHERE id = NEW.contact_id AND workspace_id = NEW.workspace_id;
    IF NOT FOUND OR v_contact_target IS DISTINCT FROM NEW.send_target THEN
      RAISE EXCEPTION 'Reply target does not match the workspace contact.' USING ERRCODE = '23514';
    END IF;
    IF NEW.reply_mode = 'auto'::public.reply_send_mode AND NOT COALESCE(v_auto_send_enabled, FALSE) THEN
      RAISE EXCEPTION 'Auto reply is not enabled for this contact.' USING ERRCODE = '23514';
    END IF;
  ELSIF (
    (NEW.platform IN ('instagram'::public.social_platform, 'youtube'::public.social_platform)
      AND v_item_kind IN ('comment'::public.inbox_kind, 'reply'::public.inbox_kind))
    OR (NEW.platform = 'x'::public.social_platform
      AND v_item_kind IN ('mention'::public.inbox_kind, 'reply'::public.inbox_kind))
  ) THEN
    IF NEW.reply_mode <> 'scheduled'::public.reply_send_mode OR NEW.contact_id IS NOT NULL THEN
      RAISE EXCEPTION 'Public replies require explicit approval and no DM contact.' USING ERRCODE = '23514';
    END IF;
    IF v_item_external_id IS NULL OR v_item_external_id IS DISTINCT FROM NEW.send_target THEN
      RAISE EXCEPTION 'Public reply target must match the ingested comment id.' USING ERRCODE = '23514';
    END IF;
    IF v_item_account_id IS NULL OR NEW.social_account_id IS DISTINCT FROM v_item_account_id THEN
      RAISE EXCEPTION 'Public reply must use its verified source account.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.social_accounts
      WHERE id = NEW.social_account_id AND workspace_id = NEW.workspace_id
        AND platform = NEW.platform AND connected = TRUE
    ) THEN
      RAISE EXCEPTION 'Public reply source account is no longer connected.' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'This platform/kind is not send-enabled.' USING ERRCODE = '23514';
  END IF;

  IF NEW.suggestion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_reply_suggestions
    WHERE id = NEW.suggestion_id
      AND workspace_id = NEW.workspace_id AND inbox_item_id = NEW.inbox_item_id
  ) THEN
    RAISE EXCEPTION 'Reply suggestion does not belong to this inbox item.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.inbox_item_id::TEXT, 0));
  IF EXISTS (
    SELECT 1 FROM public.reply_jobs
    WHERE inbox_item_id = NEW.inbox_item_id
      AND (status <> 'cancelled'::public.reply_job_status
        OR COALESCE(error_message, '') LIKE 'EXTERNAL_RESULT_UNKNOWN:%')
  ) THEN
    RAISE EXCEPTION 'This inbox item already has a reply job or an unsafe prior external result.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

-- Keep the original immutable snapshot and state-machine checks, adding
-- sender-account immutability and a public-reply stale-claim cancellation fence.
CREATE OR REPLACE FUNCTION public.guard_reply_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_unsafe BOOLEAN := COALESCE(OLD.error_message, '') LIKE 'EXTERNAL_RESULT_UNKNOWN:%';
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
  IF NEW.social_account_id IS DISTINCT FROM OLD.social_account_id AND NEW.social_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reply sender account cannot be changed.' USING ERRCODE = '23514';
  END IF;
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND NEW.contact_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reply job contact may only be cleared by referential cleanup.' USING ERRCODE = '23514';
  END IF;
  IF NEW.suggestion_id IS DISTINCT FROM OLD.suggestion_id AND NEW.suggestion_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reply job suggestion may only be cleared by referential cleanup.' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'sent'::public.reply_job_status AND NEW.status <> 'sent'::public.reply_job_status THEN
    RAISE EXCEPTION 'A sent reply cannot leave the sent state.' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'cancelled'::public.reply_job_status AND NEW.status <> 'cancelled'::public.reply_job_status THEN
    RAISE EXCEPTION 'A cancelled reply cannot be reactivated.' USING ERRCODE = '23514';
  END IF;
  IF v_old_unsafe AND NEW.status <> 'sent'::public.reply_job_status
     AND NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'Unknown external reply-result marker cannot be cleared.' USING ERRCODE = '23514';
  END IF;
  IF OLD.platform <> 'line'::public.social_platform AND OLD.claim_token IS NOT NULL
     AND NEW.status = 'cancelled'::public.reply_job_status THEN
    RAISE EXCEPTION 'A claimed public reply cannot be cancelled or safely retried without reconciliation.' USING ERRCODE = '23514';
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

COMMENT ON COLUMN public.inbox_items.social_account_id IS 'Verified receiver account assigned at signed webhook or account-scoped sync ingestion.';
COMMENT ON COLUMN public.reply_jobs.social_account_id IS 'Pinned sender account. Public replies require it and never change it on reconnect.';
COMMENT ON FUNCTION public.guard_reply_job_insert() IS 'Enforces public reply provenance, LINE contact consent, and unsafe-result tombstones.';
COMMENT ON FUNCTION public.guard_reply_job_update() IS 'Preserves reply snapshot and sender identity; forbids replay through a claimed public reply.';

COMMIT;
