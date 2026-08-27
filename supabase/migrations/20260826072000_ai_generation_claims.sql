-- Serialize budget-guarded AI calls per workspace and dedupe concurrent reply
-- generation for one inbox item before any external Anthropic request occurs.
--
-- Both claim tables are service-role only (RLS enabled with no policies). A
-- random claim_token prevents an old/stale request from deleting a newer
-- request's reclaimed lock in its finally block.

BEGIN;

CREATE TABLE public.ai_budget_claims (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_budget_claims ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_budget_claims IS
  'Service-role-only mutex used when ANTHROPIC_MONTHLY_BUDGET_USD is configured. Serializes billable AI calls per workspace so concurrent requests cannot all pass the same stale budget check.';

CREATE TABLE public.ai_reply_generation_claims (
  inbox_item_id UUID PRIMARY KEY REFERENCES public.inbox_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_reply_generation_claims_workspace_idx
  ON public.ai_reply_generation_claims(workspace_id);

ALTER TABLE public.ai_reply_generation_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_ai_reply_generation_claim_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.inbox_items
    WHERE id = NEW.inbox_item_id
      AND workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'AI reply generation claim does not match the inbox item workspace.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_ai_reply_generation_claim_workspace
  BEFORE INSERT OR UPDATE ON public.ai_reply_generation_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_ai_reply_generation_claim_workspace();

COMMENT ON TABLE public.ai_reply_generation_claims IS
  'Service-role-only short-lived mutex for one inbound message. Prevents manual and automatic reply generation from billing Anthropic concurrently for the same DM.';

COMMIT;
