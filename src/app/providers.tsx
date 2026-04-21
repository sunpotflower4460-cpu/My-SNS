'use client'

import { AuthProvider } from '@/lib/auth/auth-provider'
import { AppProvider } from '@/lib/app/app-provider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>{children}</AppProvider>
    </AuthProvider>
  )
}
