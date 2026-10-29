import { describe, expect, it } from 'vitest'
import {
  LOGIN_EMAIL_RATE_LIMIT_MESSAGE,
  LOGIN_INVALID_CREDENTIALS_MESSAGE,
  LOGIN_RATE_LIMIT_MESSAGE,
  mapLoginAuthError,
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

  it('maps a generic HTTP 429 to the attempt-limit copy, not the email one', () => {
    expect(mapLoginAuthError({ status: 429, message: 'Too Many Requests' })).toBe(LOGIN_RATE_LIMIT_MESSAGE)
    expect(mapLoginAuthError({ message: 'Request failed with status 429' })).toBe(LOGIN_RATE_LIMIT_MESSAGE)
  })

  it('keeps the email copy when the email limit is named, even with a 429 status', () => {
    expect(mapLoginAuthError({ status: 429, code: 'over_email_send_rate_limit', message: 'x' })).toBe(
      LOGIN_EMAIL_RATE_LIMIT_MESSAGE,
    )
  })

  it('maps invalid credentials to Japanese copy', () => {
    expect(mapLoginAuthError({ message: '  <b>Invalid login credentials</b>  ' })).toBe(
      LOGIN_INVALID_CREDENTIALS_MESSAGE,
    )
    expect(mapLoginAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      LOGIN_INVALID_CREDENTIALS_MESSAGE,
    )
  })

  it('falls back when the message is empty after sanitizing', () => {
    expect(mapLoginAuthError({ message: '   ' })).toBe('ログインに失敗しました。もう一度お試しください。')
    expect(mapLoginAuthError(null)).toBe('ログインに失敗しました。もう一度お試しください。')
  })
})

describe('normalizeLoginEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeLoginEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })
})
