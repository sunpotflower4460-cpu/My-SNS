'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { User as AppUser } from '@/lib/domain/types'

interface AuthContextValue {
  user: AppUser | null
  currentUserId: string | null
  isAuthenticated: boolean
  isReady: boolean
  profileError: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function sessionFallbackUser(authUser: User): AppUser {
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    name:
      (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name) ||
      authUser.email ||
      'ユーザー',
    avatarUrl: typeof authUser.user_metadata?.avatar_url === 'string' ? authUser.user_metadata.avatar_url : undefined,
    createdAt: authUser.created_at,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  async function loadUserProfile(authUser: User) {
    try {
      const supabase = createClient()
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error) {
        // Session is still valid — do not pretend the user is signed out. Keep a
        // session-derived identity so workspace bootstrap can retry instead of
        // bouncing to the login screen on a transient profiles read failure.
        console.error('Error loading profile:', error)
        setUser(sessionFallbackUser(authUser))
        setProfileError(error.message)
      } else if (profile) {
        setUser({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatar_url,
          createdAt: profile.created_at,
        })
        setProfileError(null)
      }
    } catch (error) {
      console.error('Error loading profile:', error)
      setUser(sessionFallbackUser(authUser))
      setProfileError(error instanceof Error ? error.message : 'プロフィールを読み込めませんでした')
    } finally {
      setIsReady(true)
    }
  }

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user)
      } else {
        setIsReady(true)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user)
      } else {
        setUser(null)
        setProfileError(null)
        setIsReady(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setProfileError(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        currentUserId: user?.id ?? null,
        isAuthenticated: !!user,
        isReady,
        profileError,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
