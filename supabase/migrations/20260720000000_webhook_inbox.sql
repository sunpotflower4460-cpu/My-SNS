BEGIN;

ALTER TABLE public.inbox_items ADD COLUMN external_id TEXT;

COMMENT ON COLUMN public.inbox_items.external_id IS
  'The platform-native id for this comment/mention/DM/reply (e.g. an Instagram comment id, a YouTube comment id). NULL for anything that did not come from an external sync. Used to dedupe: the same platform event can arrive more than once (a webhook retry, an overlapping manual "Sync now") and must only ever produce one row — see the unique index below.';

-- Partial (external_id IS NOT NULL) so it only constrains rows that actually
-- came from an external platform sync/webhook.
CREATE UNIQUE INDEX inbox_items_external_dedupe_idx
  ON public.inbox_items (workspace_id, platform, kind, external_id)
  WHERE external_id IS NOT NULL;

COMMIT;
