import { describe, expect, it } from 'vitest'
import { getPlatformSetupStatus } from './platform-status'
import { buildPlatformRedirectUri, PLATFORM_SETUP_GUIDES } from './platform-setup'
import { CONNECTABLE_PLATFORMS } from './platforms'

describe('getPlatformSetupStatus', () => {
  it('lists every missing env var by name', () => {
    expect(getPlatformSetupStatus('x', {})).toEqual({ configured: false, missingEnv: ['X_CLIENT_ID', 'X_CLIENT_SECRET'] })
  })

  it('treats a half-configured platform as not configured (id without secret fails at the callback)', () => {
    const status = getPlatformSetupStatus('youtube', { YOUTUBE_CLIENT_ID: 'id' })
    expect(status.configured).toBe(false)
    expect(status.missingEnv).toEqual(['YOUTUBE_CLIENT_SECRET'])
  })

  it('treats whitespace-only values as unset', () => {
    expect(getPlatformSetupStatus('tiktok', { TIKTOK_CLIENT_KEY: '  ', TIKTOK_CLIENT_SECRET: 's' }).missingEnv).toEqual(['TIKTOK_CLIENT_KEY'])
  })

  it('is configured when every var is present, and never returns values', () => {
    const status = getPlatformSetupStatus('instagram', { META_APP_ID: 'a', META_APP_SECRET: 'b' })
    expect(status).toEqual({ configured: true, missingEnv: [] })
  })
})

describe('platform setup guides', () => {
  it('covers every connectable platform with steps and env vars', () => {
    for (const platform of CONNECTABLE_PLATFORMS) {
      const guide = PLATFORM_SETUP_GUIDES[platform]
      expect(guide.platform).toBe(platform)
      expect(guide.envVars.length).toBeGreaterThan(0)
      expect(guide.steps.length).toBeGreaterThan(0)
      expect(guide.consoleUrl.startsWith('https://')).toBe(true)
    }
  })

  it('builds the redirect URI the callback route expects, without doubling slashes', () => {
    expect(buildPlatformRedirectUri('http://127.0.0.1:3000/', 'x')).toBe('http://127.0.0.1:3000/api/social/x/callback')
  })
})
