// ─── Users ───────────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: string
}

// ─── Workspaces ───────────────────────────────────────────────────────────────
export interface Workspace {
  id: string
  name: string
  slug: string
  logoUrl?: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

// ─── Workspace Members ────────────────────────────────────────────────────────
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer'

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
  joinedAt: string
  user?: User
}

// ─── Invitations ──────────────────────────────────────────────────────────────
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  status: InvitationStatus
  invitedBy: string
  createdAt: string
  expiresAt: string
}

// ─── Social Accounts ──────────────────────────────────────────────────────────
export type SocialPlatform = 'youtube' | 'instagram' | 'threads' | 'x' | 'tiktok' | 'facebook'

export interface SocialAccount {
  id: string
  workspaceId: string
  platform: SocialPlatform
  handle: string
  connected: boolean
  connectedAt?: string
}

// ─── Contents ─────────────────────────────────────────────────────────────────
export type ContentType = 'music' | 'video' | 'image' | 'text' | 'mixed'
export type ContentStatus = 'draft' | 'ready' | 'published' | 'archived'

export interface Content {
  id: string
  workspaceId: string
  title: string
  body?: string
  type: ContentType
  status: ContentStatus
  tags: string[]
  authorId: string
  createdAt: string
  updatedAt: string
  author?: User
}

// ─── Assets ───────────────────────────────────────────────────────────────────
export type AssetType = 'image' | 'video' | 'audio' | 'document'

export interface Asset {
  id: string
  workspaceId: string
  contentId?: string
  name: string
  url: string
  storagePath?: string
  type: AssetType
  size: number
  uploadedBy: string
  createdAt: string
}

// ─── Social Drafts ────────────────────────────────────────────────────────────
export interface SocialDraft {
  id: string
  workspaceId: string
  contentId: string
  platform: SocialPlatform
  draftText: string
  tone: string
  length: 'short' | 'medium' | 'long'
  status: 'draft' | 'approved' | 'rejected'
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── Publish Jobs ─────────────────────────────────────────────────────────────
export type PublishJobStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'

export interface PublishJob {
  id: string
  workspaceId: string
  contentId: string
  draftId: string
  platform: SocialPlatform
  status: PublishJobStatus
  scheduledAt?: string
  publishedAt?: string
  errorMessage?: string
  createdBy: string
  createdAt: string
}

// ─── Inbox Items ──────────────────────────────────────────────────────────────
export type InboxKind = 'dm' | 'comment' | 'reply' | 'mention'

export interface InboxItem {
  id: string
  workspaceId: string
  platform: SocialPlatform
  kind: InboxKind
  authorHandle: string
  authorAvatarUrl?: string
  text: string
  contentId?: string
  receivedAt: string
  isRead: boolean
  needsAction: boolean
  isStarred: boolean
  aiSummary?: string
  relatedContent?: Content
}

// ─── Inbox Notes ──────────────────────────────────────────────────────────────
export interface InboxNote {
  id: string
  inboxItemId: string
  authorId: string
  text: string
  createdAt: string
}

// ─── AI Reply Suggestions ─────────────────────────────────────────────────────
export interface AiReplySuggestion {
  id: string
  inboxItemId: string
  suggestedText: string
  tone: string
  createdAt: string
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export type AuditAction =
  | 'member_invited'
  | 'member_removed'
  | 'role_changed'
  | 'content_created'
  | 'content_updated'
  | 'draft_edited'
  | 'queue_item_scheduled'
  | 'queue_item_cancelled'
  | 'inbox_item_read'
  | 'inbox_item_starred'
  | 'inbox_item_needs_action'
  | 'inbox_note_added'
  | 'workspace_settings_updated'

export interface AuditLog {
  id: string
  workspaceId: string
  actorId: string
  action: AuditAction
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  createdAt: string
  actor?: User
}
