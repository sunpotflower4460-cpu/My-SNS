-- Incoming LINE / Instagram webhooks identify the receiving account by the
-- provider's external account id, then resolve that id to exactly one workspace.
-- Allowing the same real account to be connected in two workspaces makes that
-- routing ambiguous (`maybeSingle()` errors) and causes every webhook delivery
-- to retry with 503. Webhook-capable accounts therefore have one active
-- workspace owner at a time.

BEGIN;

-- Repair any legacy ambiguous active connections before creating the unique
-- index. Keep the most recently connected/updated row and retire the rest;
-- credentials for retired duplicates are removed so they cannot still publish.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY platform, external_account_id
      ORDER BY connected_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS rn
  FROM public.social_accounts
  WHERE connected = TRUE
    AND external_account_id IS NOT NULL
    AND platform IN ('line'::public.social_platform, 'instagram'::public.social_platform)
), retired AS (
  UPDATE public.social_accounts AS account
  SET connected = FALSE
  FROM ranked
  WHERE account.id = ranked.id
    AND ranked.rn > 1
  RETURNING account.id
)
DELETE FROM public.social_account_credentials
WHERE social_account_id IN (SELECT id FROM retired);

CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_one_webhook_owner_per_external_account
  ON public.social_accounts(platform, external_account_id)
  WHERE connected = TRUE
    AND external_account_id IS NOT NULL
    AND platform IN ('line'::public.social_platform, 'instagram'::public.social_platform);

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
  v_previous_connected_ids UUID[];
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

  -- First serialize account switching within one workspace/platform.
  v_workspace_lock_key := pg_catalog.hashtextextended(
    v_account.workspace_id::TEXT || ':' || v_account.platform::TEXT,
    0
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(v_workspace_lock_key);

  -- Webhook-capable accounts also serialize globally by provider account id so
  -- two workspaces racing to connect the same LINE/Instagram account do not
  -- both pass the preflight check. The unique index remains the final guard.
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
    RAISE EXCEPTION 'This webhook-capable social account is already connected to another workspace. Disconnect it there before connecting it here.' USING ERRCODE = '23505';
  END IF;

  SELECT ARRAY_AGG(id)
  INTO v_previous_connected_ids
  FROM public.social_accounts
  WHERE workspace_id = v_account.workspace_id
    AND platform = v_account.platform
    AND connected = TRUE
    AND id <> p_account_id;

  UPDATE public.social_accounts
  SET connected = FALSE
  WHERE workspace_id = v_account.workspace_id
    AND platform = v_account.platform
    AND id <> p_account_id
    AND connected = TRUE;

  IF v_previous_connected_ids IS NOT NULL THEN
    DELETE FROM public.social_account_credentials
    WHERE social_account_id = ANY(v_previous_connected_ids);
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
  'Owner/admin only. Atomically swaps one workspace/platform connection, prevents row-lock deadlocks, and guarantees LINE/Instagram webhook account ids have one active workspace owner.';

COMMIT;
