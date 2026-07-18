-- Phase 2 (messaging concierge): a notification for an auto-scheduled reply, so
-- the creator is always told when the concierge has drafted and queued a reply
-- on their behalf and can edit or cancel it within the cancel window.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction that then uses the
-- new value, so this is its own migration with NO BEGIN/COMMIT — like the other
-- enum-value additions ('line', 'reply_failed').

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'auto_reply_scheduled';
