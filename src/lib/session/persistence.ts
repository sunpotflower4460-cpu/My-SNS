import { MOCK_SESSION_STORAGE_KEY } from '@/lib/mock/repositories/helpers'

export type MockSessionStorageIssue = 'empty_value' | 'invalid_user'

export function readStoredSessionUserId(validUserIds: string[]): {
  userId: string | null
  issue: MockSessionStorageIssue | null
} {
  try {
    const stored = window.localStorage.getItem(MOCK_SESSION_STORAGE_KEY)

    if (!stored) {
      return { userId: null, issue: null }
    }

    const normalized = stored.trim()

    if (!normalized) {
      window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY)
      return { userId: null, issue: 'empty_value' }
    }

    if (!validUserIds.includes(normalized)) {
      window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY)
      return { userId: null, issue: 'invalid_user' }
    }

    return { userId: normalized, issue: null }
  } catch {
    return { userId: null, issue: null }
  }
}

export function writeStoredSessionUserId(userId: string | null) {
  try {
    if (userId) {
      window.localStorage.setItem(MOCK_SESSION_STORAGE_KEY, userId)
      return
    }

    window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY)
  } catch {}
}
