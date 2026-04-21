-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reply_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Profiles policies
-- ============================================================================
-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (for registration)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- Helper function for workspace membership check
-- ============================================================================
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_workspace_role(workspace_uuid UUID)
RETURNS workspace_role AS $$
BEGIN
  RETURN (
    SELECT role FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Workspaces policies
-- ============================================================================
-- Members can read workspaces they belong to
CREATE POLICY "Members can read own workspaces"
  ON workspaces FOR SELECT
  USING (is_workspace_member(id));

-- Users can create workspaces (they become owner)
CREATE POLICY "Users can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Owners and admins can update workspace
CREATE POLICY "Owners and admins can update workspace"
  ON workspaces FOR UPDATE
  USING (
    is_workspace_member(id) AND
    get_workspace_role(id) IN ('owner', 'admin')
  );

-- ============================================================================
-- Workspace members policies
-- ============================================================================
-- Members can read members of their workspaces
CREATE POLICY "Members can read workspace members"
  ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Owners and admins can add members
CREATE POLICY "Owners and admins can add members"
  ON workspace_members FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Owners and admins can update member roles
CREATE POLICY "Owners and admins can update member roles"
  ON workspace_members FOR UPDATE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Owners and admins can remove members
CREATE POLICY "Owners and admins can remove members"
  ON workspace_members FOR DELETE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- ============================================================================
-- Workspace invitations policies
-- ============================================================================
-- Members can read invitations for their workspaces
CREATE POLICY "Members can read workspace invitations"
  ON workspace_invitations FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Owners and admins can create invitations
CREATE POLICY "Owners and admins can create invitations"
  ON workspace_invitations FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Owners and admins can update invitations
CREATE POLICY "Owners and admins can update invitations"
  ON workspace_invitations FOR UPDATE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- ============================================================================
-- Social accounts policies
-- ============================================================================
-- Members can read social accounts for their workspaces
CREATE POLICY "Members can read workspace social accounts"
  ON social_accounts FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Admins and above can manage social accounts
CREATE POLICY "Admins can manage social accounts"
  ON social_accounts FOR ALL
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

-- ============================================================================
-- Contents policies
-- ============================================================================
-- Members can read content from their workspaces
CREATE POLICY "Members can read workspace contents"
  ON contents FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Contributors and above can create content
CREATE POLICY "Contributors can create content"
  ON contents FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
  );

-- Contributors can update their own content, editors can update any
CREATE POLICY "Users can update content"
  ON contents FOR UPDATE
  USING (
    is_workspace_member(workspace_id) AND
    (
      get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor') OR
      (get_workspace_role(workspace_id) = 'contributor' AND author_id = auth.uid())
    )
  );

-- Editors and above can delete content
CREATE POLICY "Editors can delete content"
  ON contents FOR DELETE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

-- ============================================================================
-- Assets policies
-- ============================================================================
-- Members can read assets from their workspaces
CREATE POLICY "Members can read workspace assets"
  ON assets FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Contributors and above can upload assets
CREATE POLICY "Contributors can upload assets"
  ON assets FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
  );

-- Editors and above can delete assets
CREATE POLICY "Editors can delete assets"
  ON assets FOR DELETE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

-- ============================================================================
-- Social drafts policies
-- ============================================================================
-- Members can read drafts from their workspaces
CREATE POLICY "Members can read workspace drafts"
  ON social_drafts FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Contributors and above can create drafts
CREATE POLICY "Contributors can create drafts"
  ON social_drafts FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
  );

-- Contributors can update their own drafts, editors can update any
CREATE POLICY "Users can update drafts"
  ON social_drafts FOR UPDATE
  USING (
    is_workspace_member(workspace_id) AND
    (
      get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor') OR
      (get_workspace_role(workspace_id) = 'contributor' AND created_by = auth.uid())
    )
  );

-- ============================================================================
-- Publish jobs policies
-- ============================================================================
-- Members can read publish jobs from their workspaces
CREATE POLICY "Members can read workspace publish jobs"
  ON publish_jobs FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Editors and above can create publish jobs
CREATE POLICY "Editors can create publish jobs"
  ON publish_jobs FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

-- Editors and above can update publish jobs
CREATE POLICY "Editors can update publish jobs"
  ON publish_jobs FOR UPDATE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

-- ============================================================================
-- Inbox items policies
-- ============================================================================
-- Members can read inbox items from their workspaces
CREATE POLICY "Members can read workspace inbox items"
  ON inbox_items FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Contributors and above can update inbox items (mark read, star, etc)
CREATE POLICY "Contributors can update inbox items"
  ON inbox_items FOR UPDATE
  USING (
    is_workspace_member(workspace_id) AND
    get_workspace_role(workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
  );

-- System can insert inbox items (through service role)
-- No user INSERT policy needed as inbox items come from external sources

-- ============================================================================
-- Inbox notes policies
-- ============================================================================
-- Members can read inbox notes for items they can access
CREATE POLICY "Members can read inbox notes"
  ON inbox_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inbox_items
      WHERE inbox_items.id = inbox_notes.inbox_item_id
      AND is_workspace_member(inbox_items.workspace_id)
    )
  );

-- Contributors and above can create inbox notes
CREATE POLICY "Contributors can create inbox notes"
  ON inbox_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inbox_items
      WHERE inbox_items.id = inbox_notes.inbox_item_id
      AND is_workspace_member(inbox_items.workspace_id)
      AND get_workspace_role(inbox_items.workspace_id) IN ('owner', 'admin', 'editor', 'contributor')
    )
  );

-- ============================================================================
-- AI reply suggestions policies
-- ============================================================================
-- Members can read AI suggestions for items they can access
CREATE POLICY "Members can read AI suggestions"
  ON ai_reply_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inbox_items
      WHERE inbox_items.id = ai_reply_suggestions.inbox_item_id
      AND is_workspace_member(inbox_items.workspace_id)
    )
  );

-- ============================================================================
-- Audit logs policies
-- ============================================================================
-- Members can read audit logs from their workspaces
CREATE POLICY "Members can read workspace audit logs"
  ON audit_logs FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Any workspace member can create audit logs
CREATE POLICY "Members can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
