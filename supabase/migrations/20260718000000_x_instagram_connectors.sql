-- PR4: X + Instagram connectors.
-- Adds OAuth token storage (encrypted at the application layer, never
-- selectable from the browser), short-lived OAuth handshake state, and
-- tightens social_accounts RLS to match the manage_social_accounts
-- permission (owner/admin only — editors can approve a draft but not
-- connect/disconnect a platform, matching src/lib/permissions/index.ts).

BEGIN;

ALTER TABLE public.social_accounts
  ADD COLUMN external_account_id TEXT,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TRIGGER update_social_accounts_updated_at
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.social_accounts.external_account_id IS
  'The platform-side account/page/user id needed to call its API (e.g. the linked Instagram Business Account id). Not secret.';

-- The previous "Admins can manage" policy also allowed editor, wider than
-- manage_social_accounts actually grants (owner/admin only).
DROP POLICY IF EXISTS "Admins can manage social accounts" ON public.social_accounts;

CREATE POLICY "Owners and admins can insert social accounts"
  ON public.social_accounts FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

CREATE POLICY "Owners and admins can update social accounts"
  ON public.social_accounts FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

CREATE POLICY "Owners and admins can delete social accounts"
  ON public.social_accounts FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- ============================================================================
-- OAuth credentials. Access/refresh tokens are encrypted at the application
-- layer (src/lib/crypto/token-cipher.ts, AES-256-GCM keyed by
-- SOCIAL_TOKEN_ENCRYPTION_KEY) before this table ever sees them, and RLS is
-- enabled with NO policies at all: every authenticated/anon request is
-- denied by default. Only server code using the service-role key (which
-- bypasses RLS entirely) — the OAuth callback route and the publish Worker —
-- can read or write a row here. The token ciphertext never reaches a
-- browser under any query path.
-- ============================================================================
CREATE TABLE public.social_account_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  social_account_id UUID NOT NULL UNIQUE REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.social_account_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_social_account_credentials_updated_at
  BEFORE UPDATE ON public.social_account_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.social_account_credentials IS
  'Encrypted OAuth tokens. RLS is enabled with zero policies on purpose: only the service-role key (server-only) can access this table.';

-- ============================================================================
-- oauth_states: short-lived CSRF/PKCE state for the connect -> platform ->
-- callback round trip. A human's own session both creates and later
-- consumes its own row; the callback route deletes it once used.
-- ============================================================================
CREATE TABLE public.oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX oauth_states_state_idx ON public.oauth_states(state);
CREATE INDEX oauth_states_expires_at_idx ON public.oauth_states(expires_at);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can create their own oauth state"
  ON public.oauth_states FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

CREATE POLICY "Users can read and delete their own oauth state"
  ON public.oauth_states FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own oauth state"
  ON public.oauth_states FOR DELETE
  USING (created_by = auth.uid());

COMMENT ON TABLE public.oauth_states IS
  'Short-lived (see expires_at) CSRF/PKCE state for one OAuth connect attempt. The callback route deletes its row immediately after use, whether it succeeds or fails.';

COMMIT;
