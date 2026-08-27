-- Refresh tokens (notably X) may rotate and become invalid immediately after
-- one successful use. Multiple Workers / inbox sync / analytics requests can
-- notice the same expired access token at once, so serialize refresh per social
-- account before any request is allowed to use that refresh token externally.

BEGIN;

CREATE TABLE IF NOT EXISTS public.social_credential_refresh_claims (
  social_account_id UUID PRIMARY KEY REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_credential_refresh_claims_claimed_at_idx
  ON public.social_credential_refresh_claims(claimed_at);

ALTER TABLE public.social_credential_refresh_claims ENABLE ROW LEVEL SECURITY;

-- Intentionally no authenticated/anon RLS policies. Credential resolution is
-- server-only and already uses the service-role client because the encrypted
-- credential table itself is service-role-only.
COMMENT ON TABLE public.social_credential_refresh_claims IS
  'Server-only mutex for one social account OAuth refresh. Prevents concurrent reuse of a rotating refresh token.';

COMMIT;
