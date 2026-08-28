-- Post-MVP publish path: multiple connected accounts per workspace/platform,
-- durable social_account targeting on publish_jobs, and Seed asset variants
-- (aspect ratio + thumbnail/cover/eyecatch roles).
--
-- Destructive repair is intentionally NOT performed: a workspace that already
-- has one connected row per platform is valid as-is. The previous partial
-- unique index is dropped so a second, different account can stay connected.

BEGIN;

-- ============================================================================
-- 1. Multiple connected accounts per workspace + platform
-- ============================================================================

DROP INDEX IF EXISTS public.social_accounts_one_connected_per_workspace_platform;

-- Same real account cannot be connected twice in one workspace. Reconnect of
-- that account still retires the previous connected row in
-- finalize_social_account_connection before activating the new one.
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_one_connected_per_workspace_external
  ON public.social_accounts(workspace_id, platform, external_account_id)
  WHERE connected = TRUE
    AND external_account_id IS NOT NULL;

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

  RETURN to_jsonb(v_account);
END;
$$;

COMMENT ON FUNCTION public.finalize_social_account_connection(UUID) IS
  'Owner/admin only. Activates a credential-backed pending social account without disconnecting other accounts of the same platform. Reconnect of the same external account still retires that one previous row. LINE/Instagram webhook account ids still have one active workspace owner.';

-- ============================================================================
-- 2. Target account on publish_jobs
-- ============================================================================

ALTER TABLE public.publish_jobs
  ADD COLUMN IF NOT EXISTS social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS publish_jobs_social_account_id_idx
  ON public.publish_jobs(social_account_id)
  WHERE social_account_id IS NOT NULL;

COMMENT ON COLUMN public.publish_jobs.social_account_id IS
  'The connected social_accounts row this job publishes to. NULL only when the channel has no social account (note/website) or a legacy job predates targeting; the Worker fail-closes when two connected accounts exist and this is unset.';

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
      AND status <> 'cancelled'::public.publish_job_status
  ) THEN
    RAISE EXCEPTION 'A non-cancelled publish job already exists for this Revision.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_publish_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.seed_id IS DISTINCT FROM OLD.seed_id
     OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
     OR NEW.revision_id IS DISTINCT FROM OLD.revision_id
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.publish_mode IS DISTINCT FROM OLD.publish_mode
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.social_account_id IS DISTINCT FROM OLD.social_account_id THEN
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

-- ============================================================================
-- 3. Asset aspect variants and still roles (thumbnail / cover / eyecatch)
-- ============================================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS aspect_ratio TEXT,
  ADD COLUMN IF NOT EXISTS media_role TEXT NOT NULL DEFAULT 'source',
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL;

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_aspect_ratio_check,
  DROP CONSTRAINT IF EXISTS assets_media_role_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_aspect_ratio_check
    CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('16:9', '9:16', '1:1', 'other')),
  ADD CONSTRAINT assets_media_role_check
    CHECK (media_role IN ('source', 'variant', 'thumbnail', 'cover', 'eyecatch'));

COMMENT ON COLUMN public.assets.aspect_ratio IS
  'Detected or declared pixel aspect. 9:16 is required for Shorts / Reels / TikTok; 16:9 is preferred for YouTube long-form. NULL = unknown (do not guess).';
COMMENT ON COLUMN public.assets.media_role IS
  'source = original upload; variant = cropped/transcoded sibling; thumbnail/cover/eyecatch = still used at publish, never as the main video.';
COMMENT ON COLUMN public.assets.source_asset_id IS
  'When this row is a cropped variant or a still taken from a video, the master asset it came from.';

CREATE OR REPLACE FUNCTION public.set_asset_media_attributes(
  asset_uuid UUID,
  aspect TEXT DEFAULT NULL,
  role TEXT DEFAULT NULL,
  source UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace UUID;
BEGIN
  SELECT workspace_id
    INTO target_workspace
  FROM public.assets
  WHERE id = asset_uuid;

  IF target_workspace IS NULL THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  IF NOT public.is_workspace_member(target_workspace)
    OR public.get_workspace_role(target_workspace) NOT IN ('owner', 'admin', 'editor', 'contributor') THEN
    RAISE EXCEPTION 'not allowed to update asset media attributes';
  END IF;

  IF aspect IS NOT NULL AND aspect NOT IN ('16:9', '9:16', '1:1', 'other') THEN
    RAISE EXCEPTION 'invalid aspect ratio';
  END IF;

  IF role IS NOT NULL AND role NOT IN ('source', 'variant', 'thumbnail', 'cover', 'eyecatch') THEN
    RAISE EXCEPTION 'invalid media role';
  END IF;

  UPDATE public.assets
  SET
    aspect_ratio = COALESCE(aspect, aspect_ratio),
    media_role = COALESCE(role, media_role),
    source_asset_id = CASE WHEN source IS NULL THEN source_asset_id ELSE source END
  WHERE id = asset_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_asset_media_attributes(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_asset_media_attributes(UUID, TEXT, TEXT, UUID) TO authenticated;

COMMIT;
