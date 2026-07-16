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

export type PublishingChannel = SocialPlatform | 'note' | 'website'

export const CORE_PUBLISHING_CHANNELS = [
  'youtube',
  'note',
  'instagram',
  'x',
  'tiktok',
] as const satisfies readonly PublishingChannel[]

export interface SocialAccount {
  id: string
  workspaceId: string
  platform: SocialPlatform
  handle: string
  connected: boolean
  connectedAt?: string
}

// ─── Brand profiles ──────────────────────────────────────────────────────────
export interface BrandProfile {
  id: string
  workspaceId: string
  name: string
  description?: string
  audience?: string
  voiceTraits: string[]
  values: string[]
  preferredTerms: string[]
  avoidedTerms: string[]
  defaultCallToAction?: string
  language: string
  isDefault: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type BrandProfileInput = Pick<
  BrandProfile,
  | 'name'
  | 'description'
  | 'audience'
  | 'voiceTraits'
  | 'values'
  | 'preferredTerms'
  | 'avoidedTerms'
  | 'defaultCallToAction'
  | 'language'
>

// ─── Seeds ───────────────────────────────────────────────────────────────────
export type SeedKind = 'music' | 'video' | 'image' | 'text' | 'mixed'
export type SeedStatus = 'captured' | 'ready' | 'archived'

export interface Seed {
  id: string
  workspaceId: string
  title: string
  sourceText?: string
  kind: SeedKind
  status: SeedStatus
  goal?: string
  audience?: string
  keyPoints: string[]
  callToAction?: string
  targetChannels: PublishingChannel[]
  brandProfileId?: string
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
  creator?: User
  brandProfile?: BrandProfile
}

// ─── Assets ───────────────────────────────────────────────────────────────────
export type AssetType = 'image' | 'video' | 'audio' | 'document'

export interface Asset {
  id: string
  workspaceId: string
  seedId?: string
  name: string
  url: string
  storagePath?: string
  type: AssetType
  size: number
  uploadedBy: string
  createdAt: string
}

// ─── Social Drafts ────────────────────────────────────────────────────────────
export type DraftSource = 'template' | 'ai'

export interface SocialDraft {
  id: string
  workspaceId: string
  seedId: string
  channel: PublishingChannel
  title?: string
  draftText: string
  hashtags: string[]
  cta?: string
  /** Gaps the AI filled with a guess rather than a confirmed Seed/Brand Profile fact. */
  assumptions: string[]
  /** Channel-specific extras (YouTube chapters, X thread continuation, note eyecatch ideas, ...). */
  metadata: Record<string, unknown>
  source: DraftSource
  tone: string
  length: 'short' | 'medium' | 'long'
  status: 'draft' | 'approved' | 'rejected'
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── Draft Revisions ──────────────────────────────────────────────────────────
/** An immutable, approved snapshot of a SocialDraft. Never edited after creation. */
export interface DraftRevision {
  id: string
  workspaceId: string
  seedId: string
  socialDraftId: string
  aiGenerationId?: string
  channel: PublishingChannel
  title?: string
  body: string
  hashtags: string[]
  cta?: string
  assumptions: string[]
  metadata: Record<string, unknown>
  source: DraftSource
  approvedBy: string
  createdAt: string
}

// ─── AI Generations ───────────────────────────────────────────────────────────
/** One row per real AI generation call. Never written for template fallbacks. */
export interface AiGeneration {
  id: string
  workspaceId: string
  seedId: string
  channels: PublishingChannel[]
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  createdBy: string
  createdAt: string
}

// ─── Publish Jobs ─────────────────────────────────────────────────────────────
export type PublishJobStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'

export interface PublishJob {
  id: string
  workspaceId: string
  seedId: string
  draftId: string
  channel: PublishingChannel
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
  seedId?: string
  receivedAt: string
  isRead: boolean
  needsAction: boolean
  isStarred: boolean
  aiSummary?: string
  relatedSeed?: Seed
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
  | 'seed_created'
  | 'seed_updated'
  | 'brand_profile_updated'
  | 'draft_edited'
  | 'draft_ai_generated'
  | 'draft_revision_approved'
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
