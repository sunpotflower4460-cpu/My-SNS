-- Phase 2 auto-send hardening: make a duplicate auto-reply to the same inbound
-- message impossible at the database level, not just unlikely.
--
-- The auto-reply sweep checks "does this inbox item already have a reply job?"
-- before enqueuing, but that check-then-insert has a TOCTOU window: two
-- overlapping sweeps (or a sweep racing a human) could both pass the check and
-- both enqueue, and since the send Worker's claim guard is per-row, that would
-- deliver TWO real DMs to the same person with no human review — the exact harm
-- this feature must never cause.
--
-- This partial unique index lets the losing INSERT fail; the sweep's try/catch
-- then simply skips that item. Scoped to reply_mode='auto' and active statuses
-- so it never interferes with manual replies or with a later reply after a
-- cancelled/failed one.

BEGIN;

CREATE UNIQUE INDEX reply_jobs_one_active_auto_per_item
  ON public.reply_jobs (inbox_item_id)
  WHERE reply_mode = 'auto' AND status IN ('scheduled', 'sent');

COMMENT ON INDEX public.reply_jobs_one_active_auto_per_item IS
  'At most one active (scheduled/sent) auto reply per inbox item — the DB-level backstop against a concurrent auto-reply sweep double-sending to the same recipient.';

COMMIT;
