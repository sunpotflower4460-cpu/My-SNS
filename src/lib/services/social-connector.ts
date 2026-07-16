import type { InboundInboxEvent, SocialPlatform } from '@/lib/domain/types'
import type { ConnectedAccount, InboxFetchRequest, PublishRequest, PublishResult, SocialConnectorAdapter } from './interfaces'

function connectorUnavailable(operation: string, platform?: SocialPlatform): never {
  const target = platform ? ` for ${platform}` : ''
  throw new Error(`${operation}${target} is unavailable until the reviewed platform connector phase.`)
}

export class UnavailableSocialConnectorAdapter implements SocialConnectorAdapter {
  async connect(platform: SocialPlatform): Promise<ConnectedAccount> {
    return connectorUnavailable('OAuth connection', platform)
  }

  async disconnect(platform: SocialPlatform): Promise<void> {
    return connectorUnavailable('OAuth disconnection', platform)
  }

  async refreshAccessToken(platform: SocialPlatform): Promise<ConnectedAccount> {
    return connectorUnavailable('Token refresh', platform)
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    return connectorUnavailable('Publishing', request.platform)
  }

  async fetchInbox(request: InboxFetchRequest): Promise<InboundInboxEvent[]> {
    return connectorUnavailable('Inbox sync', request.platform)
  }

  async fetchComments(request: InboxFetchRequest & { postId: string }): Promise<InboundInboxEvent[]> {
    return connectorUnavailable('Comment sync', request.platform)
  }

  async fetchMentions(request: InboxFetchRequest): Promise<InboundInboxEvent[]> {
    return connectorUnavailable('Mention sync', request.platform)
  }

  async fetchMessages(request: InboxFetchRequest): Promise<InboundInboxEvent[]> {
    return connectorUnavailable('Message sync', request.platform)
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
