export const LOGIN_EMAIL_RATE_LIMIT_MESSAGE =
  '確認メールの送信上限に達しました。しばらく待ってから、もう一度お試しください。'

export const LOGIN_RATE_LIMIT_MESSAGE =
  '試行回数が多すぎます。しばらく待ってから、もう一度お試しください。'

export const LOGIN_INVALID_CREDENTIALS_MESSAGE =
  'メールアドレスまたはパスワードが違います。初めての方は「アカウント作成」から始めてください。'

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

  // Sending a confirmation email is limited separately from password attempts;
  // only claim the email limit when GoTrue says it is the email limit.
  if (haystack.includes('over_email_send_rate_limit') || haystack.includes('email rate limit exceeded')) {
    return LOGIN_EMAIL_RATE_LIMIT_MESSAGE
  }

  if (Number(status) === 429 || haystack.includes('over_request_rate_limit') || /\b429\b/.test(haystack)) {
    return LOGIN_RATE_LIMIT_MESSAGE
  }

  if (
    haystack.includes('invalid_credentials') ||
    haystack.includes('invalid login credentials') ||
    haystack.includes('invalid email or password')
  ) {
    return LOGIN_INVALID_CREDENTIALS_MESSAGE
  }

  if (haystack.includes('user_already_exists') || haystack.includes('already been registered')) {
    return 'このメールアドレスはすでに登録されています。ログインしてください。'
  }

  return sanitizeAuthErrorMessage(message) || FALLBACK_AUTH_ERROR_MESSAGE
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
