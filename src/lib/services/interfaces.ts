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

export interface SocialConnectorAdapter {
  connect(platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount>
  disconnect(platform: SocialPlatform): Promise<void>
  refreshAccessToken(platform: SocialPlatform, refreshToken: string): Promise<ConnectedAccount>
  publish(request: PublishRequest): Promise<PublishResult>
  fetchInbox(request: InboxFetchRequest): Promise<InboundInboxEvent[]>
  fetchComments(request: InboxFetchRequest & { postId: string }): Promise<InboundInboxEvent[]>
  fetchMentions(request: InboxFetchRequest): Promise<InboundInboxEvent[]>
  fetchMessages(request: InboxFetchRequest): Promise<InboundInboxEvent[]>
  /** Live engagement counts for one already-published post — see PostMetrics for why nothing is cached. */
  fetchMetrics(request: InboxFetchRequest & { postId: string }): Promise<PostMetrics>
  generateOpenUrl(platform: SocialPlatform, handle: string): string
}
