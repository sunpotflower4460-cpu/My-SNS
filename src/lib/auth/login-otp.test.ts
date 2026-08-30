import { afterEach, describe, expect, it } from 'vitest'
import {
  LOGIN_EMAIL_RATE_LIMIT_MESSAGE,
  OTP_COOLDOWN_MS,
  getOtpCooldownUntil,
  isOtpCooldownActive,
  mapLoginAuthError,
  markOtpSent,
  normalizeLoginEmail,
} from './login-otp'

describe('mapLoginAuthError', () => {
  it('maps the English email rate-limit message', () => {
    expect(mapLoginAuthError({ message: 'email rate limit exceeded' })).toBe(LOGIN_EMAIL_RATE_LIMIT_MESSAGE)
  })

  it('maps over_email_send_rate_limit regardless of casing', () => {
    expect(mapLoginAuthError({ code: 'over_email_send_rate_limit', message: 'Too many emails' })).toBe(
      LOGIN_EMAIL_RATE_LIMIT_MESSAGE,
    )
  })

  it('maps HTTP 429', () => {
    expect(mapLoginAuthError({ status: 429, message: 'Too Many Requests' })).toBe(LOGIN_EMAIL_RATE_LIMIT_MESSAGE)
    expect(mapLoginAuthError({ message: 'Request failed with status 429' })).toBe(LOGIN_EMAIL_RATE_LIMIT_MESSAGE)
  })

  it('keeps other messages as a trimmed, tag-stripped fallback', () => {
    expect(mapLoginAuthError({ message: '  <b>Invalid login credentials</b>  ' })).toBe('Invalid login credentials')
  })

  it('falls back when the message is empty after sanitizing', () => {
    expect(mapLoginAuthError({ message: '   ' })).toBe('ログインに失敗しました。もう一度お試しください。')
    expect(mapLoginAuthError(null)).toBe('ログインに失敗しました。もう一度お試しください。')
  })
})

describe('otp cooldown', () => {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.get(key) ?? null
    },
    key() {
      return null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }

  afterEach(() => {
    store.clear()
  })

  it('normalizes email before looking up cooldown', () => {
    expect(normalizeLoginEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })

  it('blocks a second send within 60 seconds for the same email', () => {
    const now = 1_700_000_000_000
    markOtpSent('  Ada@Example.COM ', now, storage)

    expect(isOtpCooldownActive('ada@example.com', now + 1, storage)).toBe(true)
    expect(getOtpCooldownUntil('ada@example.com', now + 1, storage)).toBe(now + OTP_COOLDOWN_MS)
    expect(isOtpCooldownActive('ada@example.com', now + OTP_COOLDOWN_MS, storage)).toBe(false)
  })

  it('does not apply cooldown to a different email', () => {
    markOtpSent('one@example.com', 0, storage)
    expect(isOtpCooldownActive('two@example.com', 1, storage)).toBe(false)
  })
})
