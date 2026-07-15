-- PR0: keep unreleased creator assets private and workspace-scoped.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS assets_storage_path_idx
  ON public.assets(storage_path)
  WHERE storage_path IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', FALSE)
ON CONFLICT (id) DO UPDATE
SET public = FALSE;

-- Pin SECURITY DEFINER functions to explicit schemas.
CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(workspace_uuid UUID)
RETURNS public.workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid();
$$;

ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.handle_new_workspace() SET search_path = '';

DROP POLICY IF EXISTS "Workspace members can read private assets" ON storage.objects;
CREATE POLICY "Workspace members can read private assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assets'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.is_workspace_member(((storage.foldername(name))[1])::UUID)
      ELSE FALSE
    END
  );

DROP POLICY IF EXISTS "Contributors can upload private assets" ON storage.objects;
CREATE POLICY "Contributors can upload private assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assets'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.get_workspace_role(((storage.foldername(name))[1])::UUID)
        IN ('owner', 'admin', 'editor', 'contributor')
      ELSE FALSE
    END
  );

DROP POLICY IF EXISTS "Asset owners and editors can delete private assets" ON storage.objects;
CREATE POLICY "Asset owners and editors can delete private assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assets'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (
        owner_id = auth.uid()::TEXT
        OR public.get_workspace_role(((storage.foldername(name))[1])::UUID)
          IN ('owner', 'admin', 'editor')
      )
      ELSE FALSE
    END
  );
