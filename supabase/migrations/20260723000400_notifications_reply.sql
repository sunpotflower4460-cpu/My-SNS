-- Phase 1 (messaging concierge) PR-C: a notification type for a failed
-- outbound reply send, mirroring 'publish_failed' on the publish side.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block that then uses
-- the new value, and (on older Postgres) cannot run inside a transaction at all,
-- so this is its own migration with NO BEGIN/COMMIT — exactly like the
-- 'line' social_platform value was added on its own.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'reply_failed';
