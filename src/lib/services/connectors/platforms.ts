// Client-safe: no server-only imports (no node:crypto, no adapter classes).
// Anything that touches an actual adapter belongs in index.ts instead.

export type ConnectablePlatform = 'x' | 'instagram' | 'youtube' | 'tiktok'

// The platforms with a working OAuth "Connect" flow: X/Instagram (PR4),
// YouTube/TikTok (PR5).
export const CONNECTABLE_PLATFORMS: ConnectablePlatform[] = ['x', 'instagram', 'youtube', 'tiktok']

export function isConnectablePlatform(value: string): value is ConnectablePlatform {
  return value === 'x' || value === 'instagram' || value === 'youtube' || value === 'tiktok'
}
