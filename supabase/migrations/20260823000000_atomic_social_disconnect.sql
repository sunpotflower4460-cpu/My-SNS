-- Keep social account state and encrypted credential cleanup in one database
-- transaction. Previously the route marked connected=false first, then used a
-- separate service-role request to delete credentials. If that second request
-- failed, the UI received an error even though the account was already
-- disconnected, and encrypted credentials could remain stored indefinitely.

BEGIN;

CREATE OR REPLACE FUNCTION public.disconnect_social_account(
  p_workspace_id UUID,
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.social_accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
  END IF;

  IF public.get_workspace_role(p_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not allowed to disconnect social accounts for this workspace.' USING ERRCODE = '42501';
  END IF;

  -- Lock the account so a simultaneous connect/disconnect cannot interleave
  -- account state with credential cleanup.
  SELECT *
  INTO v_account
  FROM public.social_accounts
  WHERE id = p_account_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social account not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.social_accounts
  SET connected = FALSE
  WHERE id = p_account_id
    AND workspace_id = p_workspace_id
  RETURNING * INTO v_account;

  -- This table intentionally has no authenticated RLS policies. The
  -- SECURITY DEFINER function is the narrow, role-checked path that can
  -- remove the encrypted row atomically with the account-state update.
  DELETE FROM public.social_account_credentials
  WHERE social_account_id = p_account_id;

  RETURN to_jsonb(v_account);
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_social_account(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disconnect_social_account(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.disconnect_social_account(UUID, UUID) IS
  'Atomically marks one workspace social account disconnected and removes its encrypted credentials. Owner/admin only.';

COMMIT;
