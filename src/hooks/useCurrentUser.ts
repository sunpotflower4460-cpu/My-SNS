import { useAuth } from '@/lib/auth/auth-provider'

export function useCurrentUser() {
  const {
    user: currentUser,
    currentUserId,
    isAuthenticated,
    isReady,
    signOut,
  } = useAuth()

  return {
    currentUser,
    currentUserId,
    isAuthenticated,
    isReady,
    signOut,
  }
}
