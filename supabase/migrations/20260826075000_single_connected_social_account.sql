-- A workspace may stage a new OAuth connection without taking the currently
-- working account offline. Only finalization switches which account is active,
-- and that switch is one database transaction. This also establishes the DB
-- invariant the publishing Worker already relies on: at most one connected
-- account per workspace + platform.

BEGIN;

-- The original schema made (workspace, platform, handle) unique. Reconnecting
-- the SAME handle therefore reused the live row and set connected=false before
-- the new credential had been safely stored. Allow a separate pending row so a
-- failed reconnect never damages the working connection.
ALTER TABLE public.social_accounts
  DROP CONSTRAINT IF EXISTS social_accounts_workspace_id_platform_handle_key;

-- Repair any legacy duplicate-active rows before installing the invariant.
-- Keep the most recently connected/updated row and retire the rest. Credentials
-- for retired active duplicates are removed so stale secrets do not linger.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, platform
      ORDER BY connected_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS rn
  FROM public.social_accounts
  WHERE connected = TRUE
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

CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_one_connected_per_workspace_platform
  ON public.social_accounts(workspace_id, platform)
  WHERE connected = TRUE;

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
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

  -- Serialize competing callbacks for the same workspace/platform. A second
  -- callback waits here, then deliberately becomes the last successful winner.
  PERFORM 1
  FROM public.social_accounts
  WHERE workspace_id = v_account.workspace_id
    AND platform = v_account.platform
  ORDER BY id
  FOR UPDATE;

  -- The application stores the encrypted credential BEFORE calling this RPC.
  -- Never advertise a row as connected unless that credential is durable.
  IF NOT EXISTS (
    SELECT 1
    FROM public.social_account_credentials
    WHERE social_account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Credential is missing for pending social account.' USING ERRCODE = 'P0002';
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

  -- Retired accounts must not retain refresh/access credentials. Do not touch
  -- other pending rows: another concurrent OAuth callback may have just stored
  -- its credential and be waiting on the row lock above.
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

REVOKE ALL ON FUNCTION public.finalize_social_account_connection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_social_account_connection(UUID) TO authenticated;

COMMENT ON FUNCTION public.finalize_social_account_connection(UUID) IS
  'Owner/admin only. Atomically activates a credential-backed pending social account, disconnects the previously active account for that platform, and removes the retired credential.';

COMMIT;
