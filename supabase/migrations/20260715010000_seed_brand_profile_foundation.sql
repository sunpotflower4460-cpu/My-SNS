-- PR1: make the creator's raw Seed and reusable Brand Profile separate sources
-- of truth. This migration preserves every existing content row and relation.

BEGIN;

CREATE TYPE public.publishing_channel AS ENUM (
  'youtube',
  'note',
  'instagram',
  'x',
  'tiktok',
  'threads',
  'facebook',
  'website'
);

CREATE TYPE public.seed_status AS ENUM ('captured', 'ready', 'archived');

CREATE TABLE public.brand_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  audience TEXT,
  voice_traits TEXT[] NOT NULL DEFAULT '{}',
  values TEXT[] NOT NULL DEFAULT '{}',
  preferred_terms TEXT[] NOT NULL DEFAULT '{}',
  avoided_terms TEXT[] NOT NULL DEFAULT '{}',
  default_call_to_action TEXT,
  language TEXT NOT NULL DEFAULT 'ja',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_profiles_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT brand_profiles_language_not_blank CHECK (length(btrim(language)) > 0),
  UNIQUE (id, workspace_id)
);

CREATE INDEX brand_profiles_workspace_id_idx ON public.brand_profiles(workspace_id);
CREATE UNIQUE INDEX brand_profiles_one_default_per_workspace_idx
  ON public.brand_profiles(workspace_id)
  WHERE is_default;

INSERT INTO public.brand_profiles (
  workspace_id,
  name,
  description,
  language,
  is_default,
  created_by
)
SELECT
  workspace.id,
  workspace.name || ' Brand',
  'The reusable voice and values for this creator workspace.',
  'ja',
  TRUE,
  workspace.owner_id
FROM public.workspaces AS workspace
WHERE NOT EXISTS (
  SELECT 1
  FROM public.brand_profiles AS profile
  WHERE profile.workspace_id = workspace.id
    AND profile.is_default
);

-- Promote the existing content model to Seed without dropping data.
ALTER TABLE public.contents RENAME TO seeds;
ALTER TYPE public.content_type RENAME TO seed_kind;

ALTER TABLE public.seeds RENAME COLUMN body TO source_text;
ALTER TABLE public.seeds RENAME COLUMN type TO kind;
ALTER TABLE public.seeds RENAME COLUMN author_id TO created_by;

ALTER TABLE public.seeds ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.seeds
  ALTER COLUMN status TYPE public.seed_status
  USING (
    CASE status::TEXT
      WHEN 'ready' THEN 'ready'
      WHEN 'published' THEN 'ready'
      WHEN 'archived' THEN 'archived'
      ELSE 'captured'
    END
  )::public.seed_status;
ALTER TABLE public.seeds ALTER COLUMN status SET DEFAULT 'captured';
DROP TYPE public.content_status;

ALTER TABLE public.seeds
  ADD COLUMN goal TEXT,
  ADD COLUMN audience TEXT,
  ADD COLUMN key_points TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN call_to_action TEXT,
  ADD COLUMN target_channels public.publishing_channel[] NOT NULL DEFAULT ARRAY[
    'youtube'::public.publishing_channel,
    'note'::public.publishing_channel,
    'instagram'::public.publishing_channel,
    'x'::public.publishing_channel,
    'tiktok'::public.publishing_channel
  ],
  ADD COLUMN brand_profile_id UUID;

UPDATE public.seeds AS seed
SET brand_profile_id = profile.id
FROM public.brand_profiles AS profile
WHERE profile.workspace_id = seed.workspace_id
  AND profile.is_default
  AND seed.brand_profile_id IS NULL;

ALTER TABLE public.seeds
  ALTER COLUMN brand_profile_id SET NOT NULL,
  ADD CONSTRAINT seeds_brand_profile_workspace_fk
    FOREIGN KEY (brand_profile_id, workspace_id)
    REFERENCES public.brand_profiles(id, workspace_id)
    ON DELETE RESTRICT;

ALTER INDEX public.contents_workspace_id_idx RENAME TO seeds_workspace_id_idx;
ALTER INDEX public.contents_author_id_idx RENAME TO seeds_created_by_idx;
ALTER INDEX public.contents_status_idx RENAME TO seeds_status_idx;
ALTER INDEX public.contents_tags_idx RENAME TO seeds_tags_idx;
CREATE INDEX seeds_brand_profile_id_idx ON public.seeds(brand_profile_id);
CREATE INDEX seeds_target_channels_idx ON public.seeds USING GIN(target_channels);

-- Keep all downstream relationships intact while adopting Seed terminology.
ALTER TABLE public.assets RENAME COLUMN content_id TO seed_id;
ALTER INDEX public.assets_content_id_idx RENAME TO assets_seed_id_idx;

ALTER TABLE public.social_drafts RENAME COLUMN content_id TO seed_id;
ALTER TABLE public.social_drafts
  ALTER COLUMN platform TYPE public.publishing_channel
  USING platform::TEXT::public.publishing_channel;
ALTER TABLE public.social_drafts RENAME COLUMN platform TO channel;
ALTER INDEX public.social_drafts_content_id_idx RENAME TO social_drafts_seed_id_idx;

ALTER TABLE public.publish_jobs RENAME COLUMN content_id TO seed_id;
ALTER TABLE public.publish_jobs
  ALTER COLUMN platform TYPE public.publishing_channel
  USING platform::TEXT::public.publishing_channel;
ALTER TABLE public.publish_jobs RENAME COLUMN platform TO channel;
ALTER INDEX public.publish_jobs_content_id_idx RENAME TO publish_jobs_seed_id_idx;

ALTER TABLE public.inbox_items RENAME COLUMN content_id TO seed_id;
ALTER INDEX public.inbox_items_content_id_idx RENAME TO inbox_items_seed_id_idx;

ALTER TRIGGER update_contents_updated_at ON public.seeds RENAME TO update_seeds_updated_at;
CREATE TRIGGER update_brand_profiles_updated_at
  BEFORE UPDATE ON public.brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recreate Seed policies with names and ownership checks matching the new model.
DROP POLICY IF EXISTS "Members can read workspace contents" ON public.seeds;
DROP POLICY IF EXISTS "Contributors can create content" ON public.seeds;
DROP POLICY IF EXISTS "Users can update content" ON public.seeds;
DROP POLICY IF EXISTS "Editors can delete content" ON public.seeds;

CREATE POLICY "Members can read workspace seeds"
  ON public.seeds FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Contributors can create seeds"
  ON public.seeds FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update seeds"
  ON public.seeds FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND (
      public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
      OR (public.get_workspace_role(workspace_id) = 'contributor' AND created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND (
      public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
      OR (public.get_workspace_role(workspace_id) = 'contributor' AND created_by = auth.uid())
    )
  );

CREATE POLICY "Editors can delete seeds"
  ON public.seeds FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read workspace brand profiles"
  ON public.brand_profiles FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Editors can create brand profiles"
  ON public.brand_profiles FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
    AND created_by = auth.uid()
  );

CREATE POLICY "Editors can update brand profiles"
  ON public.brand_profiles FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "Admins can delete non-default brand profiles"
  ON public.brand_profiles FOR DELETE
  USING (
    NOT is_default
    AND public.is_workspace_member(workspace_id)
    AND public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Every future workspace starts with one reusable default Brand Profile.
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');

  INSERT INTO public.brand_profiles (
    workspace_id,
    name,
    description,
    language,
    is_default,
    created_by
  )
  VALUES (
    NEW.id,
    NEW.name || ' Brand',
    'The reusable voice and values for this creator workspace.',
    'ja',
    TRUE,
    NEW.owner_id
  );

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.seeds IS
  'Raw creator inputs captured once before channel-specific proposals are produced.';
COMMENT ON TABLE public.brand_profiles IS
  'Reusable creator voice, audience, values, and wording constraints kept separate from individual Seeds.';
COMMENT ON COLUMN public.seeds.target_channels IS
  'Desired output channels. note remains a reviewed manual-copy channel until an official API exists.';

COMMIT;
