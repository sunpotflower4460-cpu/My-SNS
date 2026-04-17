import type { Content, SocialDraft, SocialPlatform, InboxItem } from '@/lib/domain/types'

// ─── AI Draft Generator ───────────────────────────────────────────────────────
export interface AiDraftGeneratorService {
  generateDrafts(
    content: Content,
    platforms: SocialPlatform[],
    tone: string,
    length: 'short' | 'medium' | 'long',
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
