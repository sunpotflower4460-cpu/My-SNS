import type { SocialPlatform } from '@/lib/domain/types'
import type { SocialConnectorAdapter } from '../interfaces'
import { UnavailableSocialConnectorAdapter } from '../social-connector'
import { XConnectorAdapter, buildXAuthorizeUrl, isXConfigured } from './x-connector'
import { InstagramConnectorAdapter, buildInstagramAuthorizeUrl, isInstagramConfigured } from './instagram-connector'
import type { ConnectablePlatform } from './platforms'

export type { ConnectablePlatform } from './platforms'
export { isConnectablePlatform, CONNECTABLE_PLATFORMS } from './platforms'

export function isPlatformConfigured(platform: ConnectablePlatform): boolean {
  return platform === 'x' ? isXConfigured() : isInstagramConfigured()
}

export function buildAuthorizeUrl(
  platform: ConnectablePlatform,
  state: string,
  redirectUri: string,
): { url: string; codeVerifier?: string } {
  if (platform === 'x') return buildXAuthorizeUrl(state, redirectUri)
  return { url: buildInstagramAuthorizeUrl(state, redirectUri) }
}

/** Real adapter for a connectable platform, or the fail-closed stub for everything else. */
export function getConnectorAdapter(platform: SocialPlatform): SocialConnectorAdapter {
  if (platform === 'x') return new XConnectorAdapter()
  if (platform === 'instagram') return new InstagramConnectorAdapter()
  return new UnavailableSocialConnectorAdapter()
}
