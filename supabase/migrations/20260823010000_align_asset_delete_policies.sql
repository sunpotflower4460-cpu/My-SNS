-- Keep private Storage deletion permission aligned with the relational assets
-- table and the app's delete_assets permission. Previously the Storage policy
-- also allowed any uploader to delete their own blob, so a contributor could
-- remove the file while RLS correctly prevented deletion of its assets row,
-- leaving metadata that pointed at a missing object.

BEGIN;

DROP POLICY IF EXISTS "Asset owners and editors can delete private assets" ON storage.objects;
CREATE POLICY "Editors can delete private assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assets'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.get_workspace_role(((storage.foldername(name))[1])::UUID)
        IN ('owner', 'admin', 'editor')
      ELSE FALSE
    END
  );

COMMIT;
