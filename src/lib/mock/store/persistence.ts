import type { MockAppDataState } from './types'
import { createInitialMockAppState } from './create-initial-state'
import { MOCK_APP_STORAGE_KEY } from '@/lib/mock/repositories/helpers'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function hasValidShape(value: unknown): value is Partial<MockAppDataState> {
  if (!isObject(value)) {
    return false
  }

  return (
    isArray(value.users) &&
    isArray(value.workspaces) &&
    isArray(value.members) &&
    isArray(value.invitations) &&
    isArray(value.socialAccounts) &&
    isArray(value.contents) &&
    isArray(value.assets) &&
    isArray(value.socialDrafts) &&
    isArray(value.publishJobs) &&
    isArray(value.inboxItems) &&
    isArray(value.inboxNotes) &&
    isArray(value.auditLogs) &&
    typeof value.activeWorkspaceId === 'string'
  )
}

function clearStoredMockAppState() {
  try {
    window.localStorage.removeItem(MOCK_APP_STORAGE_KEY)
  } catch {}
}

export function readStoredMockAppState(): MockAppDataState {
  const initialState = createInitialMockAppState()

  try {
    const stored = window.localStorage.getItem(MOCK_APP_STORAGE_KEY)
    if (!stored) {
      return initialState
    }

    const parsed = JSON.parse(stored) as unknown
    if (!hasValidShape(parsed)) {
      clearStoredMockAppState()
      return initialState
    }

    return {
      ...initialState,
      ...parsed,
    }
  } catch {
    clearStoredMockAppState()
    return initialState
  }
}

export function writeStoredMockAppState(state: MockAppDataState) {
  try {
    window.localStorage.setItem(MOCK_APP_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}
