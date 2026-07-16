BEGIN;

ALTER TABLE public.inbox_items ADD COLUMN external_id TEXT;

COMMENT ON COLUMN public.inbox_items.external_id IS
  'The platform-native id for this comment/mention/DM/reply (e.g. an Instagram comment id, a YouTube comment id). NULL for anything that did not come from an external sync. Used to dedupe: the same platform event can arrive more than once (a webhook retry, an overlapping manual "Sync now") and must only ever produce one row — see the unique index below.';

-- Not partial: PostgREST's .upsert({onConflict: '...'}) can only ever emit a
-- bare column list for ON CONFLICT, with no way to add a WHERE predicate —
-- it cannot target a partial index as the arbiter, so a partial version of
-- this index would make every upsert in inbox-ingest.ts fail, not just
-- duplicates. A plain unique index still works for our purposes: Postgres
-- treats each NULL external_id as distinct from every other NULL, so rows
-- that didn't come from an external sync (external_id IS NULL) never
-- conflict with each other.
CREATE UNIQUE INDEX inbox_items_external_dedupe_idx
  ON public.inbox_items (workspace_id, platform, kind, external_id);

-- Defends the assumption resolveWorkspaceIdByExternalAccount() relies on:
-- that a given platform account is ever connected to at most one workspace.
-- Without this, two workspaces could both hold connected=true rows for the
-- same real platform account, and an incoming webhook would have no correct
-- workspace to resolve to.
CREATE UNIQUE INDEX social_accounts_connected_external_account_idx
  ON public.social_accounts (platform, external_account_id)
  WHERE connected AND external_account_id IS NOT NULL;

COMMIT;
