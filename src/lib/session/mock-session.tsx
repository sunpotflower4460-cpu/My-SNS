'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { MOCK_USERS } from '@/lib/mock/seed'
import type { SessionContextValue } from './interfaces'
import { readStoredSessionUserId, type MockSessionStorageIssue, writeStoredSessionUserId } from './persistence'

const MockSessionContext = createContext<SessionContextValue | null>(null)

export function MockSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [storageIssue, setStorageIssue] = useState<MockSessionStorageIssue | null>(null)

  useEffect(() => {
    const restored = readStoredSessionUserId(MOCK_USERS.map((user) => user.id))
    setCurrentUserId(restored.userId)
    setStorageIssue(restored.issue)
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (!isReady) return

    writeStoredSessionUserId(currentUserId)
  }, [currentUserId, isReady])

  const value = useMemo<SessionContextValue>(() => {
    const currentUser = MOCK_USERS.find((user) => user.id === currentUserId) ?? null

    return {
      users: MOCK_USERS,
      currentUser,
      currentUserId,
      isAuthenticated: !!currentUser,
      isReady,
      sessionNotice:
        storageIssue === 'empty_value'
          ? 'Your last mock session was empty, so the app returned you to login.'
          : storageIssue === 'invalid_user'
            ? 'Your last mock session referenced a missing user, so it was cleared safely.'
            : null,
      signInAs: (userId: string) => {
        const match = MOCK_USERS.find((user) => user.id === userId)
        setCurrentUserId(match?.id ?? null)
        setStorageIssue(match ? null : 'invalid_user')
      },
      signOut: () => {
        setCurrentUserId(null)
        setStorageIssue(null)
      },
    }
  }, [currentUserId, isReady, storageIssue])

  return <MockSessionContext.Provider value={value}>{children}</MockSessionContext.Provider>
}

export function useMockSession() {
  const context = useContext(MockSessionContext)
  if (!context) {
    throw new Error('useMockSession must be used within MockSessionProvider')
  }

  return context
}
