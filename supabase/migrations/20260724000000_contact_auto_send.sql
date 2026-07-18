-- Phase 2 (messaging concierge): opt-in per-contact auto-send.
--
-- CLAUDE.md #4 says the AI is a proposer, not an agent — Phase 1 sent nothing
-- without explicit human approval. This is the deliberate, user-requested
-- exception: for a SPECIFIC contact the creator has pre-approved, the concierge
-- may draft AND enqueue a reply without a per-message approval. Safety rails
-- (enforced in the auto-reply sweep + worker, not here): the reply is always
-- scheduled with a minimum cancel window (never sent instantly), the creator is
-- notified so they can edit or cancel before it goes, and generation stays
-- fail-closed (no AI key / over budget → nothing is enqueued, never a fake send).
--
-- Default false: a contact is only ever auto-sent to after the creator flips
-- this on for them. The existing owner/admin/editor UPDATE policy on
-- messaging_contacts already governs who may toggle it.

BEGIN;

ALTER TABLE public.messaging_contacts
  ADD COLUMN auto_send_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.messaging_contacts.auto_send_enabled IS
  'Opt-in: when true, the auto-reply sweep may draft and enqueue a reply to this contact without per-message human approval. Always scheduled with a cancel window + notification; never an instant send. Default false.';

COMMIT;
