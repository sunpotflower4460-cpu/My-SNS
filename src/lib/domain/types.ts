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
  externalAccountId?: string
  updatedAt: string
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

/** A frozen copy of an AI-sourced draft's proposed content, taken the moment it's first saved — see the migration comment on social_drafts.ai_original_snapshot for why this, not the raw model output, is what "AI original" means here. */
export interface AiDraftSnapshot {
  title?: string
  body: string
  hashtags: string[]
  cta?: string
}

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
  aiOriginalSnapshot?: AiDraftSnapshot
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
  aiOriginalSnapshot?: AiDraftSnapshot
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

/**
 * auto = the Worker publishes it automatically once due.
 * assisted/draft = queued, reserved for a future extra review step before the Worker acts.
 * manual = the Worker never touches it (note); a human records completion.
 * owned = the creator's own site/channel (future HP integration).
 */
export type PublishMode = 'auto' | 'assisted' | 'draft' | 'manual' | 'owned'

export interface PublishJob {
  id: string
  workspaceId: string
  seedId: string
  draftId: string
  revisionId: string
  channel: PublishingChannel
  publishMode: PublishMode
  status: PublishJobStatus
  scheduledAt?: string
  publishedAt?: string
  errorMessage?: string
  /** Set while a Worker run or manual "Publish now" is actively processing this job — see publish-worker.ts. */
  claimedAt?: string
  createdBy: string
  createdAt: string
}

// ─── Publish Attempts ─────────────────────────────────────────────────────────
export type PublishAttemptStatus = 'success' | 'failed'
export type PublishFailureReason = 'auth' | 'ratelimit' | 'validation' | 'network' | 'unavailable'

/** Append-only attempt history for a PublishJob. Never edited after creation. */
export interface PublishAttempt {
  id: string
  workspaceId: string
  publishJobId: string
  attemptNumber: number
  status: PublishAttemptStatus
  failureReason?: PublishFailureReason
  errorMessage?: string
  externalPostId?: string
  externalUrl?: string
  createdBy?: string
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
  /** The platform-native id (e.g. an Instagram comment id) — set for items ingested from a webhook or a sync, absent for anything else. */
  externalId?: string
  receivedAt: string
  isRead: boolean
  needsAction: boolean
  isStarred: boolean
  aiSummary?: string
  relatedSeed?: Seed
}

// ─── Inbound Inbox Events (not yet persisted) ──────────────────────────────────
/**
 * One comment/mention/DM/reply as reported by a platform — a webhook payload
 * or a connector's pull-based fetch — before it becomes an `InboxItem` row.
 * `externalId` is the platform-native id used to dedupe: the same event can
 * be delivered more than once (a webhook retry, an overlapping manual sync).
 */
export interface InboundInboxEvent {
  platform: SocialPlatform
  kind: InboxKind
  externalId: string
  authorHandle: string
  authorAvatarUrl?: string
  text: string
  receivedAt: string
}

// ─── Post Metrics (not persisted — fetched live) ───────────────────────────────
/**
 * Engagement counts for one published post, read live from the platform on
 * request (PR7's Analytics page). Not stored: these change continuously on
 * the platform's side, so a cached number would just go stale — every field
 * is optional because not every platform/post exposes every count.
 */
export interface PostMetrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
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
  | 'queue_item_published'
  | 'queue_item_failed'
  | 'queue_item_manual_completed'
  | 'social_account_connected'
  | 'social_account_disconnected'
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
