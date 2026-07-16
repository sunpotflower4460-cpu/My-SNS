import type { InboxItem, SocialPlatform } from '@/lib/domain/types'
import type { PublishRequest, PublishResult, SocialConnectorAdapter } from './interfaces'

function connectorUnavailable(operation: string, platform?: SocialPlatform): never {
  const target = platform ? ` for ${platform}` : ''
  throw new Error(`${operation}${target} is unavailable until the reviewed platform connector phase.`)
}

export class UnavailableSocialConnectorAdapter implements SocialConnectorAdapter {
  async connect(platform: SocialPlatform): Promise<void> {
    return connectorUnavailable('OAuth connection', platform)
  }

  async disconnect(platform: SocialPlatform): Promise<void> {
    return connectorUnavailable('OAuth disconnection', platform)
  }

  async refreshToken(platform: SocialPlatform): Promise<void> {
    return connectorUnavailable('Token refresh', platform)
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    return connectorUnavailable('Publishing', request.platform)
  }

  async fetchInbox(platform: SocialPlatform): Promise<InboxItem[]> {
    return connectorUnavailable('Inbox sync', platform)
  }

  async fetchComments(platform: SocialPlatform): Promise<InboxItem[]> {
    return connectorUnavailable('Comment sync', platform)
  }

  async fetchMentions(platform: SocialPlatform): Promise<InboxItem[]> {
    return connectorUnavailable('Mention sync', platform)
  }

  async fetchMessages(platform: SocialPlatform): Promise<InboxItem[]> {
    return connectorUnavailable('Message sync', platform)
  }

  generateOpenUrl(platform: SocialPlatform, handle: string): string {
    const cleanHandle = handle.replace('@', '')
    const urls: Record<SocialPlatform, string> = {
      youtube: `https://youtube.com/@${cleanHandle}`,
      instagram: `https://instagram.com/${cleanHandle}`,
      threads: `https://threads.net/@${cleanHandle}`,
      x: `https://x.com/${cleanHandle}`,
      tiktok: `https://tiktok.com/@${cleanHandle}`,
      facebook: `https://facebook.com/${cleanHandle}`,
    }
    return urls[platform]
  }
}
