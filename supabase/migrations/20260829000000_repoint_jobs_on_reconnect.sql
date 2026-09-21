-- Reconnecting a social account retires the previous social_accounts row and
-- deletes its credentials, but publish_jobs.social_account_id (immutable via
-- guard_publish_job_update) kept pointing at the retired row, so scheduled or
-- retryable jobs failed forever with unknown_account.
--
-- 1. finalize_social_account_connection now repoints non-terminal jobs
--    (draft / scheduled / failed) from retired rows of the same
--    workspace + platform + external account identity to the new row.
-- 2. guard_publish_job_update permits exactly that transition.
-- 3. REGRESSION REPAIR: 20260828153000 re-created guard_publish_job_insert and
--    guard_publish_job_update from the pre-fence versions, silently dropping
--    the external-call fence, service-managed claims, unsafe-result markers
--    (PARTIAL_EXTERNAL_SUCCESS / EXTERNAL_RESULT_UNKNOWN / TIKTOK_PENDING) and
--    the no-reschedule tombstone rule added in 20260826079000-20260827154000.
--    Both guards are restored here from 20260827154000, plus the multi-account
--    validation from 20260828153000.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_social_account_connection(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.social_accounts%ROWTYPE;
  v_previous_same_ids UUID[];
  v_workspace_lock_key BIGINT;
  v_external_lock_key BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_account
  FROM public.social_accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social account not found.' USING ERRCODE = 'P0002';
  END IF;

  IF public.get_workspace_role(v_account.workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not allowed to connect social accounts for this workspace.' USING ERRCODE = '42501';
  END IF;

  -- Serialize reconnects of the same workspace/platform (and, below, webhook
  -- account ids globally). Do not lock "every connected row of this platform"
  -- in a way that would force a single active account.
  v_workspace_lock_key := pg_catalog.hashtextextended(
    v_account.workspace_id::TEXT || ':' || v_account.platform::TEXT,
    0
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(v_workspace_lock_key);

  IF v_account.external_account_id IS NOT NULL
     AND v_account.platform IN ('line'::public.social_platform, 'instagram'::public.social_platform) THEN
    v_external_lock_key := pg_catalog.hashtextextended(
      'webhook:' || v_account.platform::TEXT || ':' || v_account.external_account_id,
      0
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(v_external_lock_key);
  END IF;

  SELECT *
  INTO v_account
  FROM public.social_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social account not found.' USING ERRCODE = 'P0002';
  END IF;

  IF public.get_workspace_role(v_account.workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not allowed to connect social accounts for this workspace.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_account_credentials
    WHERE social_account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Credential is missing for pending social account.' USING ERRCODE = 'P0002';
  END IF;

  -- Webhook routing still requires one workspace owner per real LINE/Instagram
  -- account. Other platforms are not webhook-routed this way.
  IF v_account.external_account_id IS NOT NULL
     AND v_account.platform IN ('line'::public.social_platform, 'instagram'::public.social_platform)
     AND EXISTS (
       SELECT 1
       FROM public.social_accounts
       WHERE platform = v_account.platform
         AND external_account_id = v_account.external_account_id
         AND connected = TRUE
         AND workspace_id <> v_account.workspace_id
     ) THEN
    RAISE EXCEPTION 'このLINE / Instagramアカウントは他のワークスペースで接続済みです。先にそちらで接続を解除してください。' USING ERRCODE = '23505';
  END IF;

  -- Reconnect of the SAME external account in this workspace retires the
  -- previous connected row. A different account on the same platform stays
  -- connected.
  SELECT ARRAY_AGG(id)
  INTO v_previous_same_ids
  FROM public.social_accounts
  WHERE workspace_id = v_account.workspace_id
    AND platform = v_account.platform
    AND connected = TRUE
    AND id <> p_account_id
    AND (
      (v_account.external_account_id IS NOT NULL AND external_account_id = v_account.external_account_id)
      OR (v_account.external_account_id IS NULL AND handle = v_account.handle)
    );

  IF v_previous_same_ids IS NOT NULL THEN
    UPDATE public.social_accounts
    SET connected = FALSE
    WHERE id = ANY(v_previous_same_ids);

    DELETE FROM public.social_account_credentials
    WHERE social_account_id = ANY(v_previous_same_ids);
  END IF;

  UPDATE public.social_accounts
  SET connected = TRUE,
      connected_at = NOW()
  WHERE id = p_account_id
  RETURNING * INTO v_account;

  -- Scheduled / retryable jobs target a specific social_accounts row
  -- (publish_jobs.social_account_id). Retiring the previous row for the same
  -- external account would otherwise leave them pointing at a disconnected row
  -- whose credentials were just deleted, so they would fail forever with
  -- unknown_account. Follow the reconnect: repoint only non-terminal jobs from
  -- retired rows of the SAME identity to the new row. guard_publish_job_update
  -- allows exactly this transition and nothing else.
  UPDATE public.publish_jobs AS j
  SET social_account_id = v_account.id
  FROM public.social_accounts AS old_account
  WHERE j.social_account_id = old_account.id
    AND j.workspace_id = v_account.workspace_id
    AND j.status IN (
      'draft'::public.publish_job_status,
      'scheduled'::public.publish_job_status,
      'failed'::public.publish_job_status
    )
    AND old_account.id <> v_account.id
    AND old_account.connected = FALSE
    AND old_account.workspace_id = v_account.workspace_id
    AND old_account.platform = v_account.platform
    AND (
      (v_account.external_account_id IS NOT NULL AND old_account.external_account_id = v_account.external_account_id)
      OR (v_account.external_account_id IS NULL AND old_account.external_account_id IS NULL AND old_account.handle = v_account.handle)
    );

  RETURN to_jsonb(v_account);
END;
$$;

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
  v_account public.social_accounts%ROWTYPE;
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

  IF NEW.social_account_id IS NOT NULL THEN
    SELECT *
    INTO v_account
    FROM public.social_accounts
    WHERE id = NEW.social_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Publish job social account does not exist.' USING ERRCODE = '23503';
    END IF;

    IF v_account.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'Publish job social account belongs to another workspace.' USING ERRCODE = '23514';
    END IF;

    IF v_account.platform::TEXT IS DISTINCT FROM NEW.channel::TEXT THEN
      RAISE EXCEPTION 'Publish job social account platform does not match the job channel.' USING ERRCODE = '23514';
    END IF;
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
  v_old_account public.social_accounts%ROWTYPE;
  v_new_account public.social_accounts%ROWTYPE;
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

  -- The target account is immutable EXCEPT for the reconnect follow-up: a
  -- non-terminal job may move from a retired (disconnected) row to the
  -- currently connected row of the same workspace, platform and external
  -- account identity. Anything else (retargeting to a different account,
  -- clearing the target, touching published/cancelled jobs) is rejected.
  IF NEW.social_account_id IS DISTINCT FROM OLD.social_account_id THEN
    IF OLD.social_account_id IS NULL
       OR NEW.social_account_id IS NULL
       OR OLD.status NOT IN (
         'draft'::public.publish_job_status,
         'scheduled'::public.publish_job_status,
         'failed'::public.publish_job_status
       ) THEN
      RAISE EXCEPTION 'Publish job provenance is immutable after scheduling.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_old_account FROM public.social_accounts WHERE id = OLD.social_account_id;
    SELECT * INTO v_new_account FROM public.social_accounts WHERE id = NEW.social_account_id;

    IF v_old_account.id IS NULL
       OR v_new_account.id IS NULL
       OR v_old_account.connected IS DISTINCT FROM FALSE
       OR v_new_account.connected IS DISTINCT FROM TRUE
       OR v_old_account.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR v_new_account.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR v_old_account.platform IS DISTINCT FROM v_new_account.platform
       OR v_new_account.platform::TEXT IS DISTINCT FROM OLD.channel::TEXT
       OR NOT (
         (v_new_account.external_account_id IS NOT NULL
           AND v_old_account.external_account_id = v_new_account.external_account_id)
         OR (v_new_account.external_account_id IS NULL
           AND v_old_account.external_account_id IS NULL
           AND v_old_account.handle = v_new_account.handle)
       ) THEN
      RAISE EXCEPTION 'Publish job provenance is immutable after scheduling.' USING ERRCODE = '23514';
    END IF;
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

COMMENT ON FUNCTION public.finalize_social_account_connection(UUID) IS
  'Owner/admin only. Activates a credential-backed pending social account without disconnecting other accounts of the same platform. Reconnect of the same external account retires that one previous row and repoints its non-terminal publish jobs to the new row. LINE/Instagram webhook account ids still have one active workspace owner.';
COMMENT ON FUNCTION public.guard_publish_job_insert() IS
  'Validates Revision provenance and social account, and keeps partial/unknown/TikTok-pending external results as permanent no-reschedule tombstones.';
COMMENT ON FUNCTION public.guard_publish_job_update() IS
  'Fences service-role publish claims, preserves unsafe markers including TIKTOK_PENDING, clears the fence only after confirmed publication or a safe rejection, and allows social_account_id to change only when following a same-identity reconnect.';

COMMIT;
