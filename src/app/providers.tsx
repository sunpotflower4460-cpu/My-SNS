'use client'

import { AuthProvider } from '@/lib/auth/auth-provider'
import { MockAppProvider } from '@/lib/mock/store/provider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <MockAppProvider>{children}</MockAppProvider>
    </AuthProvider>
  )
}
