-- Make external calendar sync idempotent before any provider API call.
--
-- A calendar event may be synced to each provider at most once unless a prior
-- attempt is known to have FAILED. A PENDING row is deliberately never stolen
-- automatically: if the server dies after the provider accepted the create but
-- before the DB can record success, the external result is unknown. Blocking a
-- retry is safer than creating a duplicate calendar entry.

BEGIN;

CREATE TABLE public.calendar_sync_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  calendar_event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('notion', 'timetree')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed')),
  external_id TEXT,
  external_url TEXT,
  last_error TEXT,
  claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (calendar_event_id, provider)
);

CREATE INDEX calendar_sync_links_workspace_id_idx ON public.calendar_sync_links(workspace_id);

ALTER TABLE public.calendar_sync_links ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_calendar_sync_links_updated_at
  BEFORE UPDATE ON public.calendar_sync_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can read calendar sync links"
  ON public.calendar_sync_links FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- No direct INSERT/UPDATE/DELETE policies. The two SECURITY DEFINER functions
-- below are the only write boundary and re-check workspace membership/role.

CREATE OR REPLACE FUNCTION public.claim_calendar_sync(
  p_workspace_id UUID,
  p_calendar_event_id UUID,
  p_provider TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_workspace_member(p_workspace_id)
     OR public.get_workspace_role(p_workspace_id) NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'Not authorized to sync this calendar.' USING ERRCODE = '42501';
  END IF;

  IF p_provider NOT IN ('notion', 'timetree') THEN
    RAISE EXCEPTION 'Unsupported calendar sync provider.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.calendar_events
    WHERE id = p_calendar_event_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Calendar event does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.calendar_sync_links (
    workspace_id, calendar_event_id, provider, status,
    claimed_by, claimed_at, created_by
  ) VALUES (
    p_workspace_id, p_calendar_event_id, p_provider, 'pending',
    auth.uid(), NOW(), auth.uid()
  )
  ON CONFLICT (calendar_event_id, provider) DO UPDATE
  SET status = 'pending',
      claimed_by = auth.uid(),
      claimed_at = NOW(),
      external_id = NULL,
      external_url = NULL,
      last_error = NULL
  -- Only a provider-confirmed failure is safe to retry. Never steal pending or
  -- synced rows: either may correspond to a real external event already.
  WHERE public.calendar_sync_links.status = 'failed'
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_calendar_sync(
  p_workspace_id UUID,
  p_calendar_event_id UUID,
  p_provider TEXT,
  p_status TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_external_url TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_workspace_member(p_workspace_id)
     OR public.get_workspace_role(p_workspace_id) NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'Not authorized to finish this calendar sync.' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('synced', 'failed') THEN
    RAISE EXCEPTION 'Calendar sync can only finish as synced or failed.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.calendar_sync_links
  SET status = p_status,
      external_id = CASE WHEN p_status = 'synced' THEN p_external_id ELSE NULL END,
      external_url = CASE WHEN p_status = 'synced' THEN p_external_url ELSE NULL END,
      last_error = CASE WHEN p_status = 'failed' THEN p_error ELSE NULL END,
      claimed_by = NULL,
      claimed_at = NULL
  WHERE workspace_id = p_workspace_id
    AND calendar_event_id = p_calendar_event_id
    AND provider = p_provider
    AND status = 'pending'
    AND claimed_by = auth.uid();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Calendar sync claim is no longer owned by this request.' USING ERRCODE = '40001';
  END IF;
END;
$$;

COMMENT ON TABLE public.calendar_sync_links IS
  'Durable idempotency state for one in-app calendar event per external provider. pending is intentionally sticky when outcome is unknown to prevent duplicate external events.';

COMMIT;
