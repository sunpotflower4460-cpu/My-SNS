import type { Seed, SocialDraft, PublishingChannel, SocialPlatform, InboxItem } from '@/lib/domain/types'

// ─── Draft Generator ──────────────────────────────────────────────────────────
export interface DraftGeneratorService {
  generateDrafts(
    seed: Seed,
    channels: PublishingChannel[],
    tone: string,
    length: 'short' | 'medium' | 'long',
    context?: {
      workspaceName?: string
      createdBy?: string
    },
  ): Promise<SocialDraft[]>
}

// ─── Social Connector Adapter ─────────────────────────────────────────────────
export interface SocialConnectorAdapter {
  connect(platform: SocialPlatform, authCode: string): Promise<void>
  disconnect(platform: SocialPlatform): Promise<void>
  refreshToken(platform: SocialPlatform): Promise<void>
  publish(draftId: string): Promise<void>
  fetchInbox(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  fetchComments(platform: SocialPlatform, postId: string): Promise<InboxItem[]>
  fetchMentions(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  fetchMessages(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]>
  generateOpenUrl(platform: SocialPlatform, handle: string): string
}
