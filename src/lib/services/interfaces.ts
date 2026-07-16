import type { BrandProfile, Seed, SocialDraft, PublishingChannel, SocialPlatform, InboxItem } from '@/lib/domain/types'

// ─── Draft Generator ──────────────────────────────────────────────────────────
export interface DraftGenerationContext {
  workspaceName?: string
  createdBy?: string
  brandProfile?: BrandProfile | null
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

export interface SocialConnectorAdapter {
  connect(platform: SocialPlatform, authCode: string, options: ConnectOptions): Promise<ConnectedAccount>
  disconnect(platform: SocialPlatform): Promise<void>
  refreshAccessToken(platform: SocialPlatform, refreshToken: string): Promise<ConnectedAccount>
  publish(request: PublishRequest): Promise<PublishResult>
  fetchInbox(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  fetchComments(platform: SocialPlatform, postId: string): Promise<InboxItem[]>
  fetchMentions(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  fetchMessages(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  generateOpenUrl(platform: SocialPlatform, handle: string): string
}
