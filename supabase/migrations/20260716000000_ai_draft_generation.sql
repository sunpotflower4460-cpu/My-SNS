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
  seed_id UUID NOT NULL REFERENCES public.seeds(id) ON DELETE CASCADE,
  social_draft_id UUID NOT NULL REFERENCES public.social_drafts(id) ON DELETE CASCADE,
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

COMMIT;
