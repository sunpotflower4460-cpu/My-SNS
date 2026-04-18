import { useMockSession } from '@/lib/session/mock-session'

export function useCurrentUser() {
  const { currentUser, currentUserId, isAuthenticated, isReady, signInAs, signOut, users } = useMockSession()

  return {
    currentUser,
    currentUserId,
    isAuthenticated,
    isReady,
    signInAs,
    signOut,
    users,
  }
}
