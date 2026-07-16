// Client-safe: no server-only imports (no node:crypto, no adapter classes).
// Anything that touches an actual adapter belongs in index.ts instead.

export type ConnectablePlatform = 'x' | 'instagram'

// The only platforms with a working OAuth "Connect" flow as of PR4 —
// everything else still needs it built (PR5 for YouTube/TikTok).
export const CONNECTABLE_PLATFORMS: ConnectablePlatform[] = ['x', 'instagram']

export function isConnectablePlatform(value: string): value is ConnectablePlatform {
  return value === 'x' || value === 'instagram'
}
