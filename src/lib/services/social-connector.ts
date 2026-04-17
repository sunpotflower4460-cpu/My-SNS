import type { InboxItem, SocialPlatform } from '@/lib/domain/types'
import type { SocialConnectorAdapter } from './interfaces'
import { MOCK_INBOX_ITEMS } from '@/lib/mock/seed'

export class MockSocialConnectorAdapter implements SocialConnectorAdapter {
  async connect(_platform: SocialPlatform, _authCode: string): Promise<void> {
    // Phase 2: Wire up OAuth flow per platform
    throw new Error('connect() not implemented — wire up OAuth in Phase 2')
  }

  async disconnect(_platform: SocialPlatform): Promise<void> {
    // Phase 2: Revoke tokens and remove social account record
    throw new Error('disconnect() not implemented — wire up in Phase 2')
  }

  async refreshToken(_platform: SocialPlatform): Promise<void> {
    // Phase 2: Use refresh token from Supabase-stored credentials
    throw new Error('refreshToken() not implemented — wire up in Phase 2')
  }

  async publish(_draftId: string): Promise<void> {
    // Phase 2: Call the platform API with the approved draft text
    throw new Error('publish() not implemented — wire up platform APIs in Phase 2')
  }

  async fetchInbox(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return MOCK_INBOX_ITEMS.filter(
      (item) => item.platform === platform && item.workspaceId === workspaceId,
    )
  }

  async fetchComments(platform: SocialPlatform, postId: string): Promise<InboxItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return MOCK_INBOX_ITEMS.filter(
      (item) => item.platform === platform && item.contentId === postId && item.kind === 'comment',
    )
  }

  async fetchMentions(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return MOCK_INBOX_ITEMS.filter(
      (item) => item.platform === platform && item.workspaceId === workspaceId && item.kind === 'mention',
    )
  }

  async fetchMessages(platform: SocialPlatform, workspaceId: string): Promise<InboxItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return MOCK_INBOX_ITEMS.filter(
      (item) => item.platform === platform && item.workspaceId === workspaceId && item.kind === 'dm',
    )
  }

  generateOpenUrl(platform: SocialPlatform, handle: string): string {
    const cleanHandle = handle.replace('@', '')
    const urls: Record<SocialPlatform, string> = {
      youtube: `https://youtube.com/@${cleanHandle}`,
      instagram: `https://instagram.com/${cleanHandle}`,
      threads: `https://threads.net/@${cleanHandle}`,
      // x.com format — legacy twitter.com URLs redirect here automatically
      x: `https://x.com/${cleanHandle}`,
      tiktok: `https://tiktok.com/@${cleanHandle}`,
      facebook: `https://facebook.com/${cleanHandle}`,
    }
    return urls[platform]
  }
}
