BEGIN;

CREATE TABLE public.muse_connector_keys (
  workspace_id UUID PRIMARY KEY,
  issued_by UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  can_capture BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT muse_connector_keys_issuer_fk FOREIGN KEY (workspace_id, issued_by)
    REFERENCES public.workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.muse_capture_requests (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  payload_hash TEXT NOT NULL,
  seed_id UUID REFERENCES public.seeds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, request_id)
);

CREATE INDEX muse_capture_requests_recent_idx ON public.muse_capture_requests(workspace_id, created_at);
CREATE INDEX muse_capture_requests_seed_idx ON public.muse_capture_requests(seed_id) WHERE seed_id IS NOT NULL;

ALTER TABLE public.muse_connector_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muse_capture_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.muse_connector_keys, public.muse_capture_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.muse_connector_keys, public.muse_capture_requests TO service_role;

-- Member deletion is handled by the foreign key. Revoke rather than letting a
-- key become valid again if its issuer is demoted and later promoted.
CREATE FUNCTION public.revoke_muse_key_on_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.muse_connector_keys WHERE workspace_id = NEW.workspace_id AND issued_by = NEW.user_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_muse_key_on_demotion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER revoke_muse_key_on_demotion
AFTER UPDATE OF role ON public.workspace_members
FOR EACH ROW WHEN (OLD.role IN ('owner', 'admin') AND NEW.role NOT IN ('owner', 'admin'))
EXECUTE FUNCTION public.revoke_muse_key_on_demotion();

-- Only aggregate operational counts leave My-SNS. Never return message bodies,
-- people, draft text, account credentials, or another workspace's data.
CREATE FUNCTION public.get_muse_connector_status(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'workspaceId', k.workspace_id,
    'canCapture', k.can_capture,
    'draftsToReview', (SELECT count(*) FROM public.social_drafts d WHERE d.workspace_id = k.workspace_id AND d.status = 'draft'),
    'failedPosts', (SELECT count(*) FROM public.publish_jobs j WHERE j.workspace_id = k.workspace_id AND j.status = 'failed'),
    'duePosts', (SELECT count(*) FROM public.publish_jobs j WHERE j.workspace_id = k.workspace_id AND j.status = 'scheduled' AND j.scheduled_at <= now()),
    'inboxNeedsAction', (SELECT count(*) FROM public.inbox_items i WHERE i.workspace_id = k.workspace_id AND i.needs_action)
  )
  FROM public.muse_connector_keys k
  JOIN public.workspace_members m ON m.workspace_id = k.workspace_id AND m.user_id = k.issued_by
  WHERE k.token_hash = p_token_hash AND k.expires_at > now() AND m.role IN ('owner', 'admin');
$$;

CREATE FUNCTION public.capture_muse_seed(
  p_token_hash TEXT, p_request_id UUID, p_payload_hash TEXT,
  p_title TEXT, p_source_text TEXT, p_goal TEXT, p_channels public.publishing_channel[]
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  connector public.muse_connector_keys%ROWTYPE;
  previous_request public.muse_capture_requests%ROWTYPE;
  brand_id UUID;
  new_seed_id UUID;
BEGIN
  -- Serialize captures (including retries and the write cap) with key rotation
  -- and revocation. The caller never supplies a workspace or author ID.
  SELECT k.* INTO connector
  FROM public.muse_connector_keys k
  JOIN public.workspace_members m ON m.workspace_id = k.workspace_id AND m.user_id = k.issued_by
  WHERE k.token_hash = p_token_hash AND k.expires_at > now() AND m.role IN ('owner', 'admin')
  FOR UPDATE OF k;

  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'INVALID_KEY'); END IF;
  IF NOT connector.can_capture THEN RETURN jsonb_build_object('code', 'READ_ONLY'); END IF;

  SELECT * INTO previous_request FROM public.muse_capture_requests
  WHERE workspace_id = connector.workspace_id AND request_id = p_request_id;
  IF FOUND THEN
    IF previous_request.payload_hash <> p_payload_hash THEN
      RETURN jsonb_build_object('code', 'REQUEST_CONFLICT');
    END IF;
    IF previous_request.seed_id IS NULL THEN
      RETURN jsonb_build_object('code', 'SEED_REMOVED');
    END IF;
    RETURN jsonb_build_object(
      'workspaceId', connector.workspace_id, 'seedId', previous_request.seed_id, 'created', FALSE
    );
  END IF;

  IF (SELECT count(*) FROM public.muse_capture_requests
      WHERE workspace_id = connector.workspace_id AND created_at >= now() - INTERVAL '1 hour') >= 30 THEN
    RETURN jsonb_build_object('code', 'CAPTURE_LIMIT');
  END IF;

  SELECT id INTO brand_id FROM public.brand_profiles
  WHERE workspace_id = connector.workspace_id
  ORDER BY is_default DESC, created_at, id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'BRAND_REQUIRED', 'workspaceId', connector.workspace_id);
  END IF;

  INSERT INTO public.seeds (workspace_id, created_by, brand_profile_id, title, source_text, goal, target_channels, kind, status)
  VALUES (connector.workspace_id, connector.issued_by, brand_id, p_title, p_source_text, p_goal, p_channels, 'text', 'captured')
  RETURNING id INTO new_seed_id;

  INSERT INTO public.muse_capture_requests (workspace_id, request_id, payload_hash, seed_id)
  VALUES (connector.workspace_id, p_request_id, p_payload_hash, new_seed_id);

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
  VALUES (connector.workspace_id, connector.issued_by, 'seed_created', 'seed', new_seed_id,
    jsonb_build_object('title', p_title, 'status', 'captured', 'targetChannels', p_channels, 'source', 'muse'));

  RETURN jsonb_build_object('workspaceId', connector.workspace_id, 'seedId', new_seed_id, 'created', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_muse_connector_status(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_muse_seed(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, public.publishing_channel[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_muse_connector_status(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.capture_muse_seed(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, public.publishing_channel[]) TO service_role;

COMMIT;
