-- Phase 7B: immutable, service-role-only shadow of a Bridge GrowthStrategySnapshot.
-- Display / analytics only. Never fed into draft generation, prompts, ranking,
-- scheduling, or publishing. Browser clients have no table policies.

BEGIN;

CREATE TABLE public.shadow_growth_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  sns_ai_account_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  status TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  source_window_from TIMESTAMPTZ NOT NULL,
  source_window_to TIMESTAMPTZ NOT NULL,
  strategy_window_days INTEGER NOT NULL,
  mature_checkpoint_minutes INTEGER NOT NULL,
  sample_size INTEGER NOT NULL,
  overall_score NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  explore_rate NUMERIC NOT NULL,
  preferred JSONB NOT NULL,
  avoid JSONB NOT NULL,
  inputs_digest TEXT NOT NULL,
  imported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shadow_growth_strategies_workspace_strategy_unique UNIQUE (workspace_id, strategy_id),
  CONSTRAINT shadow_growth_strategies_status_check CHECK (status IN ('active', 'insufficient-evidence')),
  CONSTRAINT shadow_growth_strategies_sample_size_check CHECK (sample_size >= 0),
  CONSTRAINT shadow_growth_strategies_overall_score_check CHECK (overall_score >= 0 AND overall_score <= 100),
  CONSTRAINT shadow_growth_strategies_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT shadow_growth_strategies_explore_rate_check CHECK (explore_rate >= 0 AND explore_rate <= 1),
  CONSTRAINT shadow_growth_strategies_strategy_window_days_check CHECK (strategy_window_days > 0),
  CONSTRAINT shadow_growth_strategies_mature_checkpoint_minutes_check CHECK (mature_checkpoint_minutes > 0),
  CONSTRAINT shadow_growth_strategies_source_window_order_check CHECK (source_window_from <= source_window_to),
  CONSTRAINT shadow_growth_strategies_insufficient_evidence_invariant CHECK (
    status <> 'insufficient-evidence'
    OR (
      sample_size = 0
      AND confidence = 0
      AND preferred = '[]'::jsonb
      AND avoid = '[]'::jsonb
    )
  )
);

CREATE INDEX shadow_growth_strategies_latest_idx
  ON public.shadow_growth_strategies (
    workspace_id,
    social_account_id,
    generated_at DESC,
    imported_at DESC,
    strategy_id DESC
  );

ALTER TABLE public.shadow_growth_strategies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shadow_growth_strategies IS
  'Immutable Shadow Growth Strategy snapshots imported manually from Bridge. RLS is enabled with zero browser policies: only the service-role key (server route) can access this table. Not Brand Profile, not Human Correction, and not used for AI generation.';

CREATE OR REPLACE FUNCTION public.guard_shadow_growth_strategy_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_account public.social_accounts%ROWTYPE;
BEGIN
  SELECT *
  INTO v_account
  FROM public.social_accounts
  WHERE id = NEW.social_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Social account not found for shadow growth strategy.' USING ERRCODE = '23503';
  END IF;

  IF v_account.workspace_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'shadow_growth_strategies workspace does not match social_accounts.workspace_id.' USING ERRCODE = '23514';
  END IF;

  IF v_account.platform::TEXT <> NEW.platform THEN
    RAISE EXCEPTION 'shadow_growth_strategies platform does not match social_accounts.platform.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_shadow_growth_strategy_account
  BEFORE INSERT ON public.shadow_growth_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_shadow_growth_strategy_account();

CREATE OR REPLACE FUNCTION public.forbid_shadow_growth_strategy_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'shadow_growth_strategies rows are immutable.' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER forbid_shadow_growth_strategy_update
  BEFORE UPDATE ON public.shadow_growth_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_shadow_growth_strategy_mutation();

CREATE TRIGGER forbid_shadow_growth_strategy_delete
  BEFORE DELETE ON public.shadow_growth_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_shadow_growth_strategy_mutation();

COMMIT;
