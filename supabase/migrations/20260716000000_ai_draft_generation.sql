-- PR2: AI draft generation + approval.
-- Adds structured proposal fields to social_drafts, an immutable approval
-- record (draft_revisions), and AI usage/cost tracking (ai_generations).
-- No existing data is dropped or renamed.

BEGIN;

ALTER TABLE public.social_drafts
  ADD COLUMN title TEXT,
  ADD COLUMN hashtags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN cta TEXT,
  ADD COLUMN assumptions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'template',
  ADD CONSTRAINT social_drafts_source_check CHECK (source IN ('template', 'ai'));

COMMENT ON COLUMN public.social_drafts.assumptions IS
  'Gaps the AI filled with a guess rather than confirmed Seed/Brand Profile fact. Always shown to the approver.';
COMMENT ON COLUMN public.social_drafts.metadata IS
  'Channel-specific proposal fields (e.g. YouTube chapters, X thread continuation, note eyecatch ideas).';
COMMENT ON COLUMN public.social_drafts.source IS
  'template = deterministic placeholder copy. ai = a real model proposal awaiting human approval.';

-- ============================================================================
-- AI generation usage/cost tracking
-- ============================================================================
CREATE TABLE public.ai_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seed_id UUID NOT NULL REFERENCES public.seeds(id) ON DELETE CASCADE,
  channels public.publishing_channel[] NOT NULL DEFAULT '{}',
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 5) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_generations_tokens_non_negative CHECK (input_tokens >= 0 AND output_tokens >= 0),
  CONSTRAINT ai_generations_cost_non_negative CHECK (cost_usd >= 0)
);

CREATE INDEX ai_generations_workspace_id_idx ON public.ai_generations(workspace_id);
CREATE INDEX ai_generations_seed_id_idx ON public.ai_generations(seed_id);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read workspace AI generations"
  ON public.ai_generations FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Contributors can record AI generations"
  ON public.ai_generations FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
    AND created_by = auth.uid()
  );

COMMENT ON TABLE public.ai_generations IS
  'One row per real AI generation call. Never written for template fallbacks, which cost nothing.';

-- ============================================================================
-- Draft revisions: the immutable, approved snapshot of a channel proposal.
-- Once a human approves a draft, its content is frozen here so later Seed or
-- Brand Profile edits cannot silently change what was actually published.
-- ============================================================================
CREATE TABLE public.draft_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- RESTRICT (not CASCADE): a Revision is a permanent approval record. A Seed
  -- or draft that has one may not be deleted out from under it.
  seed_id UUID NOT NULL REFERENCES public.seeds(id) ON DELETE RESTRICT,
  social_draft_id UUID NOT NULL REFERENCES public.social_drafts(id) ON DELETE RESTRICT,
  ai_generation_id UUID REFERENCES public.ai_generations(id) ON DELETE SET NULL,
  channel public.publishing_channel NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  cta TEXT,
  assumptions TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL,
  approved_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT draft_revisions_source_check CHECK (source IN ('template', 'ai'))
);

CREATE INDEX draft_revisions_workspace_id_idx ON public.draft_revisions(workspace_id);
CREATE INDEX draft_revisions_seed_id_idx ON public.draft_revisions(seed_id);
CREATE INDEX draft_revisions_social_draft_id_idx ON public.draft_revisions(social_draft_id);

ALTER TABLE public.draft_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read workspace draft revisions"
  ON public.draft_revisions FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- Matches the approve_drafts permission (owner/admin/editor). Revisions are
-- intentionally append-only: no UPDATE or DELETE policy exists, so an
-- approved Revision cannot be edited or removed by any workspace member.
CREATE POLICY "Editors can approve draft revisions"
  ON public.draft_revisions FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
    AND approved_by = auth.uid()
  );

COMMENT ON TABLE public.draft_revisions IS
  'Append-only approval record. The Seed source text is never overwritten by AI; only an approved proposal snapshot is stored here.';

-- ============================================================================
-- Enforce approve_drafts at the database layer, not just in application code.
-- The existing "Users can update drafts" policy (see
-- 20260421000001_rls_policies.sql) lets a contributor update their own draft
-- row for any column, including status. Without this trigger a contributor
-- could set status = 'approved' directly (bypassing the app entirely) and
-- the draft would sit "approved" with no matching Revision.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_draft_approval_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF public.get_workspace_role(NEW.workspace_id) NOT IN ('owner', 'admin', 'editor') THEN
      RAISE EXCEPTION 'Only owner, admin, or editor workspace members can approve a draft';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_draft_approval_permission_trigger
  BEFORE UPDATE ON public.social_drafts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_draft_approval_permission();

-- ============================================================================
-- Atomic approve: marks the draft approved and writes its Revision snapshot
-- in a single statement/transaction. SECURITY INVOKER (the default) so it
-- still runs as the calling user — the trigger above and the draft_revisions
-- INSERT policy both still apply; if either rejects the call, nothing
-- commits, so a draft can never end up "approved" without a Revision.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_social_draft(p_draft_id UUID)
RETURNS public.draft_revisions
LANGUAGE plpgsql
AS $$
DECLARE
  v_draft public.social_drafts;
  v_revision public.draft_revisions;
BEGIN
  UPDATE public.social_drafts
  SET status = 'approved'
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % was not found or you do not have access to it', p_draft_id;
  END IF;

  INSERT INTO public.draft_revisions (
    workspace_id, seed_id, social_draft_id, channel, title, body,
    hashtags, cta, assumptions, metadata, source, approved_by
  ) VALUES (
    v_draft.workspace_id, v_draft.seed_id, v_draft.id, v_draft.channel, v_draft.title, v_draft.draft_text,
    v_draft.hashtags, v_draft.cta, v_draft.assumptions, v_draft.metadata, v_draft.source, auth.uid()
  )
  RETURNING * INTO v_revision;

  RETURN v_revision;
END;
$$;

COMMIT;
