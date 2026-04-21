import type { User } from '@/lib/domain/types'

export interface SessionContextValue {
  users: User[]
  currentUser: User | null
  currentUserId: string | null
  isAuthenticated: boolean
  isReady: boolean
  sessionNotice: string | null
  signInAs: (userId: string) => void
  signOut: () => void
}
