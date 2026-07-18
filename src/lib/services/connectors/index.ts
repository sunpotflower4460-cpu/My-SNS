import type { SocialPlatform } from '@/lib/domain/types'
import type { SocialConnectorAdapter } from '../interfaces'
import { UnavailableSocialConnectorAdapter } from '../social-connector'
import { XConnectorAdapter, buildXAuthorizeUrl, isXConfigured } from './x-connector'
import { InstagramConnectorAdapter, buildInstagramAuthorizeUrl, isInstagramConfigured } from './instagram-connector'
import { YouTubeConnectorAdapter, buildYouTubeAuthorizeUrl, isYouTubeConfigured } from './youtube-connector'
import { TikTokConnectorAdapter, buildTikTokAuthorizeUrl, isTikTokConfigured } from './tiktok-connector'
import { LineConnectorAdapter } from './line-connector'
import type { ConnectablePlatform } from './platforms'

export type { ConnectablePlatform } from './platforms'
export { isConnectablePlatform, CONNECTABLE_PLATFORMS } from './platforms'
// LINE is deliberately NOT a ConnectablePlatform (it has no OAuth authorize
// redirect — see line-connector.ts). It connects via its own dedicated route
// (/api/social/line/connect), so it only needs the adapter registry + config
// check, not buildAuthorizeUrl / isPlatformConfigured.
export { isLineConfigured } from './line-connector'

export function isPlatformConfigured(platform: ConnectablePlatform): boolean {
  switch (platform) {
    case 'x':
      return isXConfigured()
    case 'instagram':
      return isInstagramConfigured()
    case 'youtube':
      return isYouTubeConfigured()
    case 'tiktok':
      return isTikTokConfigured()
  }
}

export function buildAuthorizeUrl(
  platform: ConnectablePlatform,
  state: string,
  redirectUri: string,
): { url: string; codeVerifier?: string } {
  switch (platform) {
    case 'x':
      return buildXAuthorizeUrl(state, redirectUri)
    case 'tiktok':
      return buildTikTokAuthorizeUrl(state, redirectUri)
    case 'instagram':
      return { url: buildInstagramAuthorizeUrl(state, redirectUri) }
    case 'youtube':
      return { url: buildYouTubeAuthorizeUrl(state, redirectUri) }
  }
}

/** Real adapter for a connectable platform, or the fail-closed stub for everything else. */
export function getConnectorAdapter(platform: SocialPlatform): SocialConnectorAdapter {
  switch (platform) {
    case 'x':
      return new XConnectorAdapter()
    case 'instagram':
      return new InstagramConnectorAdapter()
    case 'youtube':
      return new YouTubeConnectorAdapter()
    case 'tiktok':
      return new TikTokConnectorAdapter()
    case 'line':
      return new LineConnectorAdapter()
    default:
      return new UnavailableSocialConnectorAdapter()
  }
}
