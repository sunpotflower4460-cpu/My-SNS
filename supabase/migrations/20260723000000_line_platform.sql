-- Phase 1 (messaging concierge): add LINE as a social platform so LINE
-- Official Account DMs can land in the same unified inbox as Instagram DMs.
--
-- Deliberately isolated in its own migration with NO dependent DDL/DML, and
-- intentionally NOT wrapped in BEGIN/COMMIT: Postgres forbids USING a newly
-- added enum value in the same transaction that adds it. Keeping this ADD
-- VALUE alone (auto-committed) means later migrations can freely reference the
-- 'line' literal. Migrations that only reference the social_platform *type*
-- (column definitions) are safe regardless.
ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'line';
