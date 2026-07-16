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
/** The already-approved Revision content a Worker hands to an adapter — the adapter never fetches its own data. */
export interface PublishRequest {
  platform: SocialPlatform
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

export interface SocialConnectorAdapter {
  connect(platform: SocialPlatform, authCode: string): Promise<void>
  disconnect(platform: SocialPlatform): Promise<void>
  refreshToken(platform: SocialPlatform): Promise<void>
  publish(request: PublishRequest): Promise<PublishResult>
  fetchInbox(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  fetchComments(platform: SocialPlatform, postId: string): Promise<InboxItem[]>
  fetchMentions(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  fetchMessages(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  generateOpenUrl(platform: SocialPlatform, handle: string): string
}
