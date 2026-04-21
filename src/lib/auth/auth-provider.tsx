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
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const supabase = createClient()

  useEffect(() => {
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
        setIsReady(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadUserProfile(authUser: User) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        setUser(null)
      } else if (profile) {
        setUser({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatar_url,
          createdAt: profile.created_at,
        })
      }
    } catch (error) {
      console.error('Error loading profile:', error)
      setUser(null)
    } finally {
      setIsReady(true)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        currentUserId: user?.id ?? null,
        isAuthenticated: !!user,
        isReady,
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
