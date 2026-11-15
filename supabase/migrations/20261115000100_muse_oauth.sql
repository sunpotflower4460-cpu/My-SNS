BEGIN;

CREATE TABLE public.muse_oauth_codes (
  code_hash TEXT PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  workspace_id UUID NOT NULL,
  issued_by UUID NOT NULL,
  code_challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  can_capture BOOLEAN NOT NULL,
  previous_token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  FOREIGN KEY (workspace_id, issued_by)
    REFERENCES public.workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX muse_oauth_codes_workspace_issuer_idx ON public.muse_oauth_codes(workspace_id, issued_by);
CREATE INDEX muse_oauth_codes_expiry_idx ON public.muse_oauth_codes(expires_at);

ALTER TABLE public.muse_oauth_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.muse_oauth_codes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revoke_muse_key_on_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.muse_connector_keys WHERE workspace_id = NEW.workspace_id AND issued_by = NEW.user_id;
  DELETE FROM public.muse_oauth_codes WHERE workspace_id = NEW.workspace_id AND issued_by = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.approve_muse_oauth(
  p_workspace_id UUID, p_user_id UUID, p_code_hash TEXT, p_code_challenge TEXT,
  p_redirect_uri TEXT, p_can_capture BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND role IN ('owner', 'admin')
  FOR SHARE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  DELETE FROM public.muse_oauth_codes WHERE expires_at <= now();
  INSERT INTO public.muse_oauth_codes (
    code_hash, workspace_id, issued_by, code_challenge, redirect_uri, can_capture, previous_token_hash
  )
  VALUES (
    p_code_hash, p_workspace_id, p_user_id, p_code_challenge, p_redirect_uri, p_can_capture,
    (SELECT token_hash FROM public.muse_connector_keys WHERE workspace_id = p_workspace_id)
  );
  RETURN TRUE;
END;
$$;

CREATE FUNCTION public.exchange_muse_oauth_code(
  p_code_hash TEXT, p_code_challenge TEXT, p_redirect_uri TEXT, p_token_hash TEXT, p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  saved_code public.muse_oauth_codes%ROWTYPE;
BEGIN
  SELECT * INTO saved_code FROM public.muse_oauth_codes
  WHERE code_hash = p_code_hash AND code_challenge = p_code_challenge
    AND redirect_uri = p_redirect_uri AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Lock the role before consuming the code so demotion cannot race redemption.
  PERFORM 1 FROM public.workspace_members
  WHERE workspace_id = saved_code.workspace_id AND user_id = saved_code.issued_by AND role IN ('owner', 'admin')
  FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  DELETE FROM public.muse_oauth_codes WHERE code_hash = saved_code.code_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- A code approved before rotation or revocation cannot replace a newer key.
  IF saved_code.previous_token_hash IS NULL THEN
    INSERT INTO public.muse_connector_keys (workspace_id, issued_by, token_hash, can_capture, expires_at)
    VALUES (saved_code.workspace_id, saved_code.issued_by, p_token_hash, saved_code.can_capture, p_expires_at)
    ON CONFLICT (workspace_id) DO NOTHING;
  ELSE
    UPDATE public.muse_connector_keys
    SET issued_by = saved_code.issued_by, token_hash = p_token_hash,
      can_capture = saved_code.can_capture, expires_at = p_expires_at
    WHERE workspace_id = saved_code.workspace_id AND token_hash = saved_code.previous_token_hash;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('canCapture', saved_code.can_capture);
END;
$$;

GRANT SELECT, INSERT, DELETE ON public.muse_oauth_codes TO service_role;
REVOKE ALL ON FUNCTION public.approve_muse_oauth(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exchange_muse_oauth_code(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_muse_oauth(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_muse_oauth_code(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

COMMIT;
