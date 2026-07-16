BEGIN;

ALTER TABLE public.social_drafts ADD COLUMN ai_original_snapshot JSONB;
ALTER TABLE public.draft_revisions ADD COLUMN ai_original_snapshot JSONB;

COMMENT ON COLUMN public.social_drafts.ai_original_snapshot IS
  'A frozen {title, body, hashtags, cta} snapshot taken the moment an AI-sourced draft is first saved (source=''ai''), before any further human edits. Honest limitation: this is the earliest point the app''s architecture actually persists anything — the raw model output only ever exists transiently in the browser before a first save, so a quick edit made before that first save is already baked in. NULL for template-sourced drafts and for anything saved before this column existed. Never overwritten after it is first set — see upsertSocialDraft().';

COMMENT ON COLUMN public.draft_revisions.ai_original_snapshot IS
  'Copied from social_drafts.ai_original_snapshot at approval time (see approve_social_draft()). Comparing this to the Revision''s own title/body/hashtags/cta shows what a human actually changed before approving an AI proposal — the basis for PR7''s "learn from corrections" prompt feedback.';

-- Recreated (not altered) to add ai_original_snapshot to the copied columns.
-- Everything else is unchanged from the PR2 migration's definition.
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
    hashtags, cta, assumptions, metadata, source, approved_by, ai_original_snapshot
  ) VALUES (
    v_draft.workspace_id, v_draft.seed_id, v_draft.id, v_draft.channel, v_draft.title, v_draft.draft_text,
    v_draft.hashtags, v_draft.cta, v_draft.assumptions, v_draft.metadata, v_draft.source, auth.uid(), v_draft.ai_original_snapshot
  )
  RETURNING * INTO v_revision;

  RETURN v_revision;
END;
$$;

COMMIT;
