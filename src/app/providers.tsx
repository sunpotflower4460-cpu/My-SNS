'use client'

import { AuthProvider } from '@/lib/auth/auth-provider'
import { AppProvider } from '@/lib/app/app-provider'
import { ToastProvider } from '@/components/ui/kit'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        {/* Toast region is available app-wide; existing per-page feedback is
            untouched in UI-PR0 — screens opt into toasts as they migrate. */}
        <ToastProvider>{children}</ToastProvider>
      </AppProvider>
    </AuthProvider>
  )
}
