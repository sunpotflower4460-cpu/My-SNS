-- PR5 fix-up: a lightweight claim column on publish_jobs, closing gaps an
-- independent review found in the manual "Publish now" / "Mark as posted"
-- flows once YouTube/TikTok's genuinely long-running publishes landed.
--
-- Without this, two concurrent attempts at the same job (two admins both
-- clicking "Publish now", or a cancel racing an in-flight publish) could
-- both call the real platform API, or a cancel could silently hide an
-- already-succeeded post. claimed_at makes "is this job currently being
-- worked on" an atomic, checkable fact instead of an assumption.

BEGIN;

ALTER TABLE public.publish_jobs
  ADD COLUMN claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.publish_jobs.claimed_at IS
  'Set atomically when a Worker run or a manual "Publish now" starts processing this job, cleared when it finishes (success or failure). A claim older than a few minutes is treated as abandoned (e.g. a serverless timeout killed the process before it could clear its own claim) and can be reclaimed or cancelled.';

COMMIT;
