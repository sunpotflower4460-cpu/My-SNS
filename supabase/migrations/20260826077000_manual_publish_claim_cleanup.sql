-- Align the existing atomic manual-publish RPC with the worker claim-token
-- ownership introduced later. A terminal published row must not retain an
-- orphaned claim_token after a stale claim is reconciled by a human.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_manual_publish(
  p_workspace_id UUID,
  p_job_id UUID,
  p_external_url TEXT DEFAULT NULL,
  p_external_post_id TEXT DEFAULT NULL,
  p_allow_auto BOOLEAN DEFAULT FALSE
)
RETURNS public.publish_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.publish_jobs%ROWTYPE;
  v_attempt public.publish_attempts%ROWTYPE;
  v_attempt_number INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
  END IF;

  IF public.get_workspace_role(p_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not allowed to complete publishing for this workspace.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_job
  FROM public.publish_jobs
  WHERE id = p_job_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publish job not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.status = 'published' THEN
    SELECT *
    INTO v_attempt
    FROM public.publish_attempts
    WHERE publish_job_id = p_job_id
      AND workspace_id = p_workspace_id
      AND status = 'success'
      AND created_by = auth.uid()
    ORDER BY attempt_number DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_attempt;
    END IF;

    RAISE EXCEPTION 'Publish job is already completed.' USING ERRCODE = 'P0001';
  END IF;

  IF v_job.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled publish jobs cannot be completed.' USING ERRCODE = 'P0001';
  END IF;

  IF v_job.publish_mode = 'auto' AND NOT p_allow_auto THEN
    RAISE EXCEPTION 'Auto-mode publish jobs must be completed by the publishing worker.' USING ERRCODE = '42501';
  END IF;

  IF v_job.claimed_at IS NOT NULL
     AND v_job.claimed_at >= NOW() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'Publish job is currently being processed.' USING ERRCODE = '55P03';
  END IF;

  IF p_external_url IS NOT NULL
     AND p_external_url !~* '^https?://' THEN
    RAISE EXCEPTION 'External URL must use http or https.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO v_attempt_number
  FROM public.publish_attempts
  WHERE publish_job_id = p_job_id;

  INSERT INTO public.publish_attempts (
    workspace_id,
    publish_job_id,
    attempt_number,
    status,
    failure_reason,
    error_message,
    external_post_id,
    external_url,
    created_by
  )
  VALUES (
    p_workspace_id,
    p_job_id,
    v_attempt_number,
    'success',
    NULL,
    NULL,
    p_external_post_id,
    p_external_url,
    auth.uid()
  )
  RETURNING * INTO v_attempt;

  UPDATE public.publish_jobs
  SET
    status = 'published',
    published_at = NOW(),
    error_message = NULL,
    claimed_at = NULL,
    claim_token = NULL
  WHERE id = p_job_id
    AND workspace_id = p_workspace_id;

  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_manual_publish(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_manual_publish(UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.complete_manual_publish(UUID, UUID, TEXT, TEXT, BOOLEAN) IS
  'Atomically records a human-confirmed successful publish attempt, marks its publish job published, and clears stale Worker claim ownership. Owner/admin only; idempotent for a retried committed completion.';

COMMIT;
