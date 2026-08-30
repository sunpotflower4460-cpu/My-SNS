export const OTP_COOLDOWN_MS = 60_000
export const OTP_COOLDOWN_STORAGE_PREFIX = 'my-sns:login-otp-cooldown:'

export const LOGIN_EMAIL_RATE_LIMIT_MESSAGE =
  'メールの送信上限に達しました。標準では1時間に数通までです。受信箱の前のリンクがまだ使えることがあります。'

export const LOGIN_OTP_SENT_MESSAGE = 'メールをご確認ください。マジックリンクをお送りしました。'

export const LOGIN_OTP_ALREADY_SENT_MESSAGE = '送信済みです。メールを確認してください。'

const FALLBACK_AUTH_ERROR_MESSAGE = 'ログインに失敗しました。もう一度お試しください。'
const MAX_FALLBACK_MESSAGE_LENGTH = 180

export type LoginAuthErrorLike = {
  message?: string | null
  status?: number | string | null
  code?: string | null
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function mapLoginAuthError(error: LoginAuthErrorLike | null | undefined): string {
  const message = typeof error?.message === 'string' ? error.message : ''
  const code = typeof error?.code === 'string' ? error.code : ''
  const status = error?.status
  const haystack = `${code} ${message}`.toLowerCase()

  if (
    Number(status) === 429 ||
    haystack.includes('over_email_send_rate_limit') ||
    haystack.includes('email rate limit exceeded') ||
    /\b429\b/.test(haystack)
  ) {
    return LOGIN_EMAIL_RATE_LIMIT_MESSAGE
  }

  return sanitizeAuthErrorMessage(message) || FALLBACK_AUTH_ERROR_MESSAGE
}

export function otpCooldownStorageKey(email: string): string {
  return `${OTP_COOLDOWN_STORAGE_PREFIX}${normalizeLoginEmail(email)}`
}

export function getOtpCooldownUntil(email: string, now = Date.now(), storage = getSessionStorage()): number | null {
  const normalized = normalizeLoginEmail(email)
  if (!normalized || !storage) return null

  try {
    const raw = storage.getItem(otpCooldownStorageKey(normalized))
    if (!raw) return null
    const until = Number(raw)
    if (!Number.isFinite(until) || until <= now) {
      storage.removeItem(otpCooldownStorageKey(normalized))
      return null
    }
    return until
  } catch {
    return null
  }
}

export function isOtpCooldownActive(email: string, now = Date.now(), storage = getSessionStorage()): boolean {
  return getOtpCooldownUntil(email, now, storage) !== null
}

export function markOtpSent(email: string, now = Date.now(), storage = getSessionStorage()): number {
  const until = now + OTP_COOLDOWN_MS
  const normalized = normalizeLoginEmail(email)
  if (!normalized || !storage) return until

  try {
    storage.setItem(otpCooldownStorageKey(normalized), String(until))
  } catch {
    // Private mode / blocked storage must not break the success path.
  }

  return until
}

function sanitizeAuthErrorMessage(message: string): string {
  const stripped = message
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!stripped) return ''
  if (stripped.length <= MAX_FALLBACK_MESSAGE_LENGTH) return stripped
  return `${stripped.slice(0, MAX_FALLBACK_MESSAGE_LENGTH).trim()}…`
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof globalThis.sessionStorage === 'undefined') return null
    return globalThis.sessionStorage
  } catch {
    return null
  }
}
