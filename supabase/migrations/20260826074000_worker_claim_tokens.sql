-- Give publish/reply Worker claims an ownership token in addition to claimed_at.
-- claimed_at answers "is this claim stale?"; claim_token answers "does THIS
-- worker still own the claim it is about to release?". Without the token an
-- older request can return after a stale reclaim and accidentally clear/update
-- a newer worker's claim (the classic ABA race).

BEGIN;

ALTER TABLE public.publish_jobs
  ADD COLUMN IF NOT EXISTS claim_token UUID;

ALTER TABLE public.reply_jobs
  ADD COLUMN IF NOT EXISTS claim_token UUID;

COMMENT ON COLUMN public.publish_jobs.claim_token IS
  'Opaque ownership token for the current Worker claim. A Worker may release/update a claimed job only while this token still matches.';

COMMENT ON COLUMN public.reply_jobs.claim_token IS
  'Opaque ownership token for the current Worker claim. A Worker may release/update a claimed job only while this token still matches.';

COMMIT;
