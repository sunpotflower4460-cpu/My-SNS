import type { BrandProfile, Seed, SocialDraft, PublishingChannel, SocialPlatform, InboundInboxEvent, PostMetrics } from '@/lib/domain/types'

// ─── Draft Generator ──────────────────────────────────────────────────────────
/** One prior AI proposal a human edited before approving, for the same channel — used as a few-shot style hint (PR7). */
export interface DraftStyleExample {
  channel: PublishingChannel
  aiProposed: string
  humanApproved: string
}

export interface DraftGenerationContext {
  workspaceName?: string
  createdBy?: string
  brandProfile?: BrandProfile | null
  /** Recent human edits to AI proposals on this workspace, passed as in-context examples so future proposals drift toward the creator's actual style rather than needing supervised retraining. */
  styleExamples?: DraftStyleExample[]
}

export interface DraftGeneratorService {
  /** Returns unsaved proposals (ephemeral ids) — the caller decides whether to persist them. */
  generateDrafts(
    seed: Seed,
    channels: PublishingChannel[],
    tone: string,
    length: 'short' | 'medium' | 'long',
    context?: DraftGenerationContext,
  ): Promise<SocialDraft[]>
}

// ─── Reply Generator ──────────────────────────────────────────────────────────
/** One prior AI reply a human edited before sending, for the same contact — few-shot style hint (Phase 2 fuel; empty in Phase 1). */
export interface ReplyStyleExample {
  inbound: string
  aiProposed: string
  humanApproved: string
}

export interface ReplyGenerationContext {
  brandProfile?: BrandProfile | null
  contactDisplayName?: string
  /** A few recent messages from this thread, oldest→newest, for context. */
  recentMessages?: string[]
  styleExamples?: ReplyStyleExample[]
}

/** The AI's proposal for one inbound DM — a soft summary, a reply in the creator's voice, and the guesses it made. The human approves before anything sends. */
export interface ReplyProposal {
  /** Soft, clear Japanese summary of what the sender is asking ("この方はこう仰っています"). */
  summary: string
  /** Proposed reply in the creator's voice. */
  reply: string
  tone: string
  /** Every gap the AI filled with a guess rather than a confirmed fact. Empty if none. */
  assumptions: string[]
  /** AI-judged reply urgency, used to order the inbox. */
  priority: 'high' | 'normal' | 'low'
}

export interface ReplyGeneratorService {
  generateReply(inboundText: string, context?: ReplyGenerationContext): Promise<ReplyProposal>
}

// ─── Schedule Extractor ───────────────────────────────────────────────────────
/** One calendar event the AI extracted from a conversation. The human approves each before it lands on the calendar. */
export interface ScheduleProposal {
  title: string
  /** Absolute ISO 8601 instant (UTC) the model resolved from the conversation, given "now" in JST. */
  startsAt: string
  endsAt?: string
  allDay: boolean
  location?: string
  /** A short Japanese note on what in the message this was drawn from / any assumption made. */
  note?: string
}

export interface ScheduleExtractionContext {
  /** The current instant in Asia/Tokyo, so the model can resolve relative dates ("来週火曜") to absolute ones. */
  nowJst: string
  contactDisplayName?: string
}

export interface ScheduleExtractor {
  extractSchedule(conversationText: string, context: ScheduleExtractionContext): Promise<ScheduleProposal[]>
}

// ─── Social Connector Adapter ─────────────────────────────────────────────────
/**
 * The already-approved Revision content, plus a live decrypted access token,
 * a Worker hands to an adapter for one publish call. The adapter never
 * fetches its own data or touches storage/credentials — `metadata` stays
 * pure Revision content and is never used to carry secrets.
 */
export interface PublishRequest {
  platform: SocialPlatform
  accessToken: string
  /** The connected account's handle/username, when known — saves an adapter an extra lookup call. */
  handle?: string
  /** The platform-side account/page id (e.g. an Instagram Business Account id) some adapters need to publish. */
  externalAccountId?: string
  title?: string
  body: string
  hashtags: string[]
  cta?: string
  metadata: Record<string, unknown>
}

export interface PublishResult {
  externalPostId?: string
  externalUrl?: string
}

export interface ConnectOptions {
  /** Must exactly match the redirect_uri used to build the authorize URL — most OAuth providers require it. */
  redirectUri: string
  /** PKCE code_verifier, when the platform requires PKCE (e.g. X). */
  codeVerifier?: string
}

/** Everything the caller needs to persist a successful connection — the adapter never touches the database itself. */
export interface ConnectedAccount {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scopes: string[]
  externalAccountId?: string
  handle: string
}

/**
 * Credentials the caller resolved for one connected account — mirrors
 * PublishRequest's shape/philosophy: the adapter never touches the
 * database itself, it just receives what it needs to call the platform.
 */
export interface InboxFetchRequest {
  platform: SocialPlatform
  accessToken: string
  externalAccountId?: string
  handle?: string
}

/**
 * One outbound direct-message reply the reply Worker hands to an adapter —
 * mirrors PublishRequest's philosophy: the adapter never touches the database
 * or resolves its own credentials, it just receives the decrypted token, the
 * send target, and the final approved text.
 */
export interface SendMessageRequest {
  platform: SocialPlatform
  accessToken: string
  /** The platform-native recipient id to push to (LINE userId / Instagram PSID). */
  target: string
  text: string
  externalAccountId?: string
}

export interface SendMessageResult {
  /** The platform's own message/request id, when it returns one. */
  externalMessageId?: string
}

export interface SocialConnectorAdapter {
  connect(platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount>
  disconnect(platform: SocialPlatform): Promise<void>
  refreshAccessToken(platform: SocialPlatform, refreshToken: string): Promise<ConnectedAccount>
  publish(request: PublishRequest): Promise<PublishResult>
  /** Send one outbound DM reply. Only real messaging connectors (LINE) implement this; every other adapter fails closed. */
  sendMessage(request: SendMessageRequest): Promise<SendMessageResult>
  fetchInbox(request: InboxFetchRequest): Promise<InboundInboxEvent[]>
  fetchComments(request: InboxFetchRequest & { postId: string }): Promise<InboundInboxEvent[]>
  fetchMentions(request: InboxFetchRequest): Promise<InboundInboxEvent[]>
  fetchMessages(request: InboxFetchRequest): Promise<InboundInboxEvent[]>
  /** Live engagement counts for one already-published post — see PostMetrics for why nothing is cached. */
  fetchMetrics(request: InboxFetchRequest & { postId: string }): Promise<PostMetrics>
  generateOpenUrl(platform: SocialPlatform, handle: string): string
}
