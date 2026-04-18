'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@/lib/domain/types'
import { DEFAULT_USER_ID, MOCK_USERS } from '@/lib/mock/seed'
import { MOCK_SESSION_STORAGE_KEY } from '@/lib/mock/repositories/helpers'

interface MockSessionContextValue {
  users: User[]
  currentUser: User | null
  currentUserId: string | null
  isAuthenticated: boolean
  isReady: boolean
  signInAs: (userId: string) => void
  signOut: () => void
}

const MockSessionContext = createContext<MockSessionContextValue | null>(null)

export function MockSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(MOCK_SESSION_STORAGE_KEY)
    if (stored) {
      setCurrentUserId(stored)
    }
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (!isReady) return

    if (currentUserId) {
      window.localStorage.setItem(MOCK_SESSION_STORAGE_KEY, currentUserId)
      return
    }

    window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY)
  }, [currentUserId, isReady])

  const value = useMemo<MockSessionContextValue>(() => {
    const currentUser = MOCK_USERS.find((user) => user.id === currentUserId) ?? null

    return {
      users: MOCK_USERS,
      currentUser,
      currentUserId,
      isAuthenticated: !!currentUser,
      isReady,
      signInAs: (userId: string) => {
        const match = MOCK_USERS.find((user) => user.id === userId)
        setCurrentUserId(match?.id ?? DEFAULT_USER_ID)
      },
      signOut: () => setCurrentUserId(null),
    }
  }, [currentUserId, isReady])

  return <MockSessionContext.Provider value={value}>{children}</MockSessionContext.Provider>
}

export function useMockSession() {
  const context = useContext(MockSessionContext)
  if (!context) {
    throw new Error('useMockSession must be used within MockSessionProvider')
  }

  return context
}
