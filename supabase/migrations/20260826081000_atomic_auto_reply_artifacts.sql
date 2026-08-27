-- An auto reply is one logical database decision: persist the generated
-- suggestion and enqueue the immutable outbound reply. Writing those in two
-- separate transactions can strand a suggestion with no job; later sweeps see
-- the suggestion and permanently skip the message. Keep the artifacts atomic.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_auto_reply_artifacts(
  p_workspace_id UUID,
  p_inbox_item_id UUID,
  p_contact_id UUID,
  p_suggestion_id UUID,
  p_reply_job_id UUID,
  p_ai_generation_id UUID,
  p_reply_text TEXT,
  p_tone TEXT,
  p_assumptions TEXT[],
  p_summary TEXT,
  p_priority TEXT,
  p_send_target TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_priority NOT IN ('high', 'normal', 'low') THEN
    RAISE EXCEPTION 'Invalid auto-reply priority.' USING ERRCODE = '23514';
  END IF;

  -- Stable caller-owned ids make a committed RPC easy to reconcile if its HTTP
  -- response is lost. The surrounding transaction guarantees neither artifact
  -- can exist without the other.
  INSERT INTO public.ai_reply_suggestions (
    id,
    workspace_id,
    inbox_item_id,
    suggested_text,
    tone,
    source,
    assumptions,
    ai_generation_id
  ) VALUES (
    p_suggestion_id,
    p_workspace_id,
    p_inbox_item_id,
    p_reply_text,
    p_tone,
    'ai',
    COALESCE(p_assumptions, '{}'),
    p_ai_generation_id
  );

  UPDATE public.inbox_items
  SET ai_summary = p_summary,
      ai_priority = p_priority
  WHERE id = p_inbox_item_id
    AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto-reply inbox item does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.reply_jobs (
    id,
    workspace_id,
    inbox_item_id,
    contact_id,
    suggestion_id,
    platform,
    reply_text,
    send_target,
    reply_mode,
    status,
    scheduled_at,
    created_by
  ) VALUES (
    p_reply_job_id,
    p_workspace_id,
    p_inbox_item_id,
    p_contact_id,
    p_suggestion_id,
    'line'::public.social_platform,
    p_reply_text,
    p_send_target,
    'auto'::public.reply_send_mode,
    'scheduled'::public.reply_job_status,
    p_scheduled_at,
    p_created_by
  );

  RETURN jsonb_build_object(
    'suggestion_id', p_suggestion_id,
    'reply_job_id', p_reply_job_id,
    'scheduled_at', p_scheduled_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_auto_reply_artifacts(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_auto_reply_artifacts(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO service_role;

COMMENT ON FUNCTION public.create_auto_reply_artifacts(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) IS 'Service-role-only atomic persistence of one AI auto-reply suggestion plus its scheduled reply job. Existing reply-job triggers still enforce workspace/contact/opt-in invariants.';

COMMIT;
