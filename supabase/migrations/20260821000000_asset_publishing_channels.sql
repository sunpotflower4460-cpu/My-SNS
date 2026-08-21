-- Let one Seed keep multiple media variants while deciding which SNS each
-- asset should be handed to. An empty array intentionally means "all current
-- Seed publishing channels" so every existing asset keeps its old behavior.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS publishing_channels TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.assets.publishing_channels IS
  'Empty array = available to all Seed publishing channels; otherwise only the listed channels.';

-- Do not add a broad UPDATE RLS policy for assets. Instead expose a narrow RPC
-- that may update only publishing_channels and performs its own role check.
CREATE OR REPLACE FUNCTION public.set_asset_publishing_channels(
  asset_uuid UUID,
  channels TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace UUID;
  normalized_channels TEXT[];
BEGIN
  SELECT workspace_id
    INTO target_workspace
  FROM public.assets
  WHERE id = asset_uuid;

  IF target_workspace IS NULL THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  IF NOT public.is_workspace_member(target_workspace)
    OR public.get_workspace_role(target_workspace) NOT IN ('owner', 'admin', 'editor', 'contributor') THEN
    RAISE EXCEPTION 'not allowed to update asset publishing channels';
  END IF;

  normalized_channels := COALESCE(channels, ARRAY[]::TEXT[]);

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_channels) AS channel
    WHERE channel NOT IN (
      'youtube', 'instagram', 'threads', 'x', 'tiktok', 'facebook', 'line', 'note', 'website'
    )
  ) THEN
    RAISE EXCEPTION 'invalid publishing channel';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT channel ORDER BY channel), ARRAY[]::TEXT[])
    INTO normalized_channels
  FROM unnest(normalized_channels) AS channel;

  UPDATE public.assets
  SET publishing_channels = normalized_channels
  WHERE id = asset_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_asset_publishing_channels(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_asset_publishing_channels(UUID, TEXT[]) TO authenticated;
