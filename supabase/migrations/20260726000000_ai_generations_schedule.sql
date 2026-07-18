-- Phase 3 (schedule extraction): allow ai_generations to record the cost of a
-- propose_schedule call, keyed to the inbox item the schedule was extracted from
-- — the same shared cost ledger + monthly budget as draft and reply generation.
--
-- Relaxes the two CHECK constraints to add 'schedule' as a third purpose (also
-- inbox-item-keyed, like 'reply'). Existing rows are all 'draft'/'reply', so the
-- re-added CHECKs validate against every current row.

BEGIN;

ALTER TABLE public.ai_generations DROP CONSTRAINT ai_generations_purpose_check;
ALTER TABLE public.ai_generations DROP CONSTRAINT ai_generations_target_check;

ALTER TABLE public.ai_generations
  ADD CONSTRAINT ai_generations_purpose_check CHECK (purpose IN ('draft', 'reply', 'schedule')),
  ADD CONSTRAINT ai_generations_target_check CHECK (
    (purpose = 'draft' AND seed_id IS NOT NULL)
    OR (purpose IN ('reply', 'schedule') AND inbox_item_id IS NOT NULL)
  );

COMMENT ON COLUMN public.ai_generations.purpose IS
  'draft = a Seed→channel draft (keyed by seed_id); reply = a DM reply proposal; schedule = a calendar-event extraction from a DM (both keyed by inbox_item_id).';

COMMIT;
