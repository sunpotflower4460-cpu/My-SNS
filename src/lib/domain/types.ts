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
// 'line' is a messaging platform (LINE Official Account), not a publishing
// channel — it never appears in the Seed channel picker (CORE_PUBLISHING_CHANNELS)
// and is never scheduled as a post. It rides the same social_platform enum so
// LINE DMs land in the unified inbox alongside Instagram DMs.
export type SocialPlatform = 'youtube' | 'instagram' | 'threads' | 'x' | 'tiktok' | 'facebook' | 'line'

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
export type AssetAspectRatio = '16:9' | '9:16' | '1:1' | 'other'
export type AssetMediaRole = 'source' | 'variant' | 'thumbnail' | 'cover' | 'eyecatch'

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
  aspectRatio?: AssetAspectRatio
  mediaRole?: AssetMediaRole
  sourceAssetId?: string
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
  /** Guessed facts not in the Seed or Brand Profile. Copy-editing and thumbnail hooks are not listed. */
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
  /** Set for draft generations (purpose 'draft'); undefined for reply generations. */
  seedId?: string
  /** Set for reply generations (purpose 'reply'); undefined for draft generations. */
  inboxItemId?: string
  purpose: 'draft' | 'reply' | 'schedule'
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
  /** Connected social_accounts row this job publishes to. Required when two accounts exist for the channel. */
  socialAccountId?: string
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
  /** The conversational contact this item belongs to (set for DMs ingested with a contact). */
  contactId?: string
  /** AI-judged reply urgency, written when a reply suggestion is generated. Used to order the inbox. */
  aiPriority?: 'high' | 'normal' | 'low'
  /** The platform-native id (e.g. an Instagram comment id) — set for items ingested from a webhook or a sync, absent for anything else. */
  externalId?: string
  receivedAt: string
  isRead: boolean
  needsAction: boolean
  isStarred: boolean
  aiSummary?: string
  relatedSeed?: Seed
}

// ─── Messaging Contacts ────────────────────────────────────────────────────────
/**
 * One person the workspace converses with on one platform (LINE userId /
 * Instagram PSID). `externalContactId` is the send target for replies, and the
 * timezone / quiet-hours fields drive recipient-appropriate send timing.
 */
export interface MessagingContact {
  id: string
  workspaceId: string
  platform: SocialPlatform
  externalContactId: string
  displayName?: string
  avatarUrl?: string
  timezone?: string
  quietHoursStart?: number
  quietHoursEnd?: number
  priorityHint?: 'high' | 'normal' | 'low'
  /** Opt-in: when true, the auto-reply sweep may draft + enqueue a reply to this contact without per-message approval (always with a cancel window). */
  autoSendEnabled: boolean
  lastMessageAt?: string
  createdAt: string
  updatedAt: string
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
  workspaceId: string
  inboxItemId: string
  suggestedText: string
  tone: string
  /** 'ai' = generated by Anthropic; 'template' = deterministic fallback (shown honestly when Anthropic is unconfigured). */
  source: 'template' | 'ai'
  /** Gaps the AI filled with a guess rather than a confirmed fact — surfaced to the user before they approve a reply. */
  assumptions: string[]
  aiGenerationId?: string
  createdAt: string
}

// ─── Reply Jobs (outbound DM sends) ───────────────────────────────────────────
/** Whether a reply is sent on its recipient-appropriate schedule, or (Phase 2) auto-sent for pre-approved contacts. */
export type ReplySendMode = 'scheduled' | 'auto'
export type ReplyJobStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled'

/**
 * One approved outbound DM reply, awaiting or past its scheduled send — the
 * messaging-side twin of PublishJob. `replyText` and `sendTarget` are immutable
 * snapshots captured at approval; `scheduledAt` is absolute UTC, computed once
 * at enqueue from the recipient's timezone / quiet hours so the Worker stays
 * timezone-agnostic.
 */
export interface ReplyJob {
  id: string
  workspaceId: string
  inboxItemId: string
  contactId?: string
  suggestionId?: string
  platform: SocialPlatform
  replyText: string
  sendTarget: string
  replyMode: ReplySendMode
  status: ReplyJobStatus
  scheduledAt: string
  sentAt?: string
  errorMessage?: string
  claimedAt?: string
  createdBy: string
  createdAt: string
}

/** Append-only send-attempt history for a ReplyJob — the twin of PublishAttempt. */
export interface ReplyAttempt {
  id: string
  workspaceId: string
  replyJobId: string
  attemptNumber: number
  status: PublishAttemptStatus
  failureReason?: PublishFailureReason
  errorMessage?: string
  externalMessageId?: string
  createdBy?: string
  createdAt: string
}

// ─── Calendar Events ──────────────────────────────────────────────────────────
/**
 * One event on the workspace in-app calendar. `source='extracted'` rows are
 * promoted from an AI schedule proposal only after the human approves — nothing
 * is written here automatically.
 */
export interface CalendarEvent {
  id: string
  workspaceId: string
  title: string
  description?: string
  startsAt: string
  endsAt?: string
  allDay: boolean
  location?: string
  source: 'manual' | 'extracted'
  inboxItemId?: string
  contactId?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CalendarEventInput {
  title: string
  description?: string
  startsAt: string
  endsAt?: string
  allDay?: boolean
  location?: string
  source?: 'manual' | 'extracted'
  inboxItemId?: string
  contactId?: string
}

// ─── Creator Status ───────────────────────────────────────────────────────────
/** The creator's current mood/availability (Phase 5). Conveyed to contacts by the concierge only when shareWithContacts is true. One per creator per workspace. */
export interface CreatorStatus {
  id: string
  workspaceId: string
  userId: string
  mood: string
  note?: string
  shareWithContacts: boolean
  updatedAt: string
}

export interface CreatorStatusInput {
  mood: string
  note?: string
  shareWithContacts: boolean
}

// ─── Notifications ──────────────────────────────────────────────────────────
export type NotificationType = 'draft_needs_approval' | 'publish_failed' | 'inbox_needs_action' | 'reply_failed' | 'auto_reply_scheduled'

/** A per-user, in-app notification — see `notifications` migration's INSERT policy comment for why any workspace member can create one targeting any teammate. */
export interface Notification {
  id: string
  workspaceId: string
  userId: string
  type: NotificationType
  title: string
  body?: string
  targetType?: string
  targetId?: string
  isRead: boolean
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
  | 'inbox_reply_ai_generated'
  | 'schedule_ai_extracted'
  | 'inbox_reply_scheduled'
  | 'inbox_reply_sent'
  | 'inbox_reply_failed'
  | 'inbox_reply_cancelled'
  | 'calendar_event_created'
  | 'calendar_event_updated'
  | 'calendar_event_deleted'
  | 'queue_item_scheduled'
  | 'queue_item_cancelled'
  | 'queue_item_published'
  | 'queue_item_failed'
  | 'queue_item_manual_completed'
  | 'social_account_connected'
  | 'social_account_disconnected'
  | 'line_account_connected'
  | 'inbox_item_read'
  | 'inbox_item_starred'
  | 'inbox_item_needs_action'
  | 'inbox_note_added'
  | 'workspace_settings_updated'
  | 'workspace_data_exported'

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
