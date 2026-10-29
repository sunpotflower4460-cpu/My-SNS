import { isTokenEncryptionConfigured } from '@/lib/crypto/token-cipher'
import { PLATFORM_SETUP_GUIDES } from './platform-setup'
import { CONNECTABLE_PLATFORMS, type ConnectablePlatform } from './platforms'

// Server-only: reads process.env. Returns booleans and env var NAMES only —
// never a value — so it is safe to expose to a signed-in workspace member.

export interface PlatformSetupStatus {
  configured: boolean
  /** Env var names that are still empty. */
  missingEnv: string[]
}

export interface ConnectionSetupStatus {
  /** SOCIAL_TOKEN_ENCRYPTION_KEY is present and decodes to a valid AES-256 key. */
  tokenEncryptionReady: boolean
  platforms: Record<ConnectablePlatform, PlatformSetupStatus>
}

export function getPlatformSetupStatus(
  platform: ConnectablePlatform,
  env: Record<string, string | undefined> = process.env,
): PlatformSetupStatus {
  const missingEnv = PLATFORM_SETUP_GUIDES[platform].envVars.filter((name) => !env[name]?.trim())
  return { configured: missingEnv.length === 0, missingEnv }
}

export function getConnectionSetupStatus(): ConnectionSetupStatus {
  const platforms = Object.fromEntries(
    CONNECTABLE_PLATFORMS.map((platform) => [platform, getPlatformSetupStatus(platform)]),
  ) as Record<ConnectablePlatform, PlatformSetupStatus>
  return { tokenEncryptionReady: isTokenEncryptionConfigured(), platforms }
}
