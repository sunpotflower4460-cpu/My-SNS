-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Profiles table
-- Linked to Supabase auth.users
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX profiles_email_idx ON profiles(email);

-- ============================================================================
-- Workspaces table
-- ============================================================================
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX workspaces_owner_id_idx ON workspaces(owner_id);
CREATE INDEX workspaces_slug_idx ON workspaces(slug);

-- ============================================================================
-- Workspace members table
-- ============================================================================
CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'editor', 'contributor', 'viewer');

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX workspace_members_workspace_id_idx ON workspace_members(workspace_id);
CREATE INDEX workspace_members_user_id_idx ON workspace_members(user_id);

-- ============================================================================
-- Workspace invitations table
-- ============================================================================
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role workspace_role NOT NULL DEFAULT 'viewer',
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX workspace_invitations_workspace_id_idx ON workspace_invitations(workspace_id);
CREATE INDEX workspace_invitations_email_idx ON workspace_invitations(email);
CREATE INDEX workspace_invitations_status_idx ON workspace_invitations(status);

-- ============================================================================
-- Social accounts table
-- ============================================================================
CREATE TYPE social_platform AS ENUM ('youtube', 'instagram', 'threads', 'x', 'tiktok', 'facebook');

CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  handle TEXT NOT NULL,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, platform, handle)
);

CREATE INDEX social_accounts_workspace_id_idx ON social_accounts(workspace_id);

-- ============================================================================
-- Contents table
-- ============================================================================
CREATE TYPE content_type AS ENUM ('music', 'video', 'image', 'text', 'mixed');
CREATE TYPE content_status AS ENUM ('draft', 'ready', 'published', 'archived');

CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type content_type NOT NULL DEFAULT 'text',
  status content_status NOT NULL DEFAULT 'draft',
  tags TEXT[] DEFAULT '{}',
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contents_workspace_id_idx ON contents(workspace_id);
CREATE INDEX contents_author_id_idx ON contents(author_id);
CREATE INDEX contents_status_idx ON contents(status);
CREATE INDEX contents_tags_idx ON contents USING GIN(tags);

-- ============================================================================
-- Assets table
-- ============================================================================
CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio', 'document');

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type asset_type NOT NULL,
  size BIGINT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX assets_workspace_id_idx ON assets(workspace_id);
CREATE INDEX assets_content_id_idx ON assets(content_id);
CREATE INDEX assets_uploaded_by_idx ON assets(uploaded_by);

-- ============================================================================
-- Social drafts table
-- ============================================================================
CREATE TYPE draft_status AS ENUM ('draft', 'approved', 'rejected');
CREATE TYPE draft_length AS ENUM ('short', 'medium', 'long');

CREATE TABLE social_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  draft_text TEXT NOT NULL,
  tone TEXT NOT NULL,
  length draft_length NOT NULL DEFAULT 'medium',
  status draft_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX social_drafts_workspace_id_idx ON social_drafts(workspace_id);
CREATE INDEX social_drafts_content_id_idx ON social_drafts(content_id);
CREATE INDEX social_drafts_status_idx ON social_drafts(status);

-- ============================================================================
-- Publish jobs table
-- ============================================================================
CREATE TYPE publish_job_status AS ENUM ('draft', 'scheduled', 'published', 'failed', 'cancelled');

CREATE TABLE publish_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES social_drafts(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  status publish_job_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX publish_jobs_workspace_id_idx ON publish_jobs(workspace_id);
CREATE INDEX publish_jobs_content_id_idx ON publish_jobs(content_id);
CREATE INDEX publish_jobs_status_idx ON publish_jobs(status);
CREATE INDEX publish_jobs_scheduled_at_idx ON publish_jobs(scheduled_at);

-- ============================================================================
-- Inbox items table
-- ============================================================================
CREATE TYPE inbox_kind AS ENUM ('dm', 'comment', 'reply', 'mention');

CREATE TABLE inbox_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  kind inbox_kind NOT NULL,
  author_handle TEXT NOT NULL,
  author_avatar_url TEXT,
  text TEXT NOT NULL,
  content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  needs_action BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred BOOLEAN NOT NULL DEFAULT FALSE,
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inbox_items_workspace_id_idx ON inbox_items(workspace_id);
CREATE INDEX inbox_items_content_id_idx ON inbox_items(content_id);
CREATE INDEX inbox_items_is_read_idx ON inbox_items(is_read);
CREATE INDEX inbox_items_needs_action_idx ON inbox_items(needs_action);
CREATE INDEX inbox_items_is_starred_idx ON inbox_items(is_starred);

-- ============================================================================
-- Inbox notes table
-- ============================================================================
CREATE TABLE inbox_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inbox_item_id UUID NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inbox_notes_inbox_item_id_idx ON inbox_notes(inbox_item_id);
CREATE INDEX inbox_notes_author_id_idx ON inbox_notes(author_id);

-- ============================================================================
-- AI reply suggestions table
-- ============================================================================
CREATE TABLE ai_reply_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inbox_item_id UUID NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  suggested_text TEXT NOT NULL,
  tone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_reply_suggestions_inbox_item_id_idx ON ai_reply_suggestions(inbox_item_id);

-- ============================================================================
-- Audit logs table
-- ============================================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_workspace_id_idx ON audit_logs(workspace_id);
CREATE INDEX audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs(target_type, target_id);

-- ============================================================================
-- Functions and triggers for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contents_updated_at BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_drafts_updated_at BEFORE UPDATE ON social_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
