'use client'

import { AuthProvider } from '@/lib/auth/auth-provider'
import { AppProvider } from '@/lib/app/app-provider'
import WorkspaceConsistencyGuard from '@/components/workspace/WorkspaceConsistencyGuard'
import { ToastProvider } from '@/components/ui/kit'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        <WorkspaceConsistencyGuard>
          {/* Toast region is available app-wide; existing per-page feedback is
              untouched in UI-PR0 — screens opt into toasts as they migrate. */}
          <ToastProvider>{children}</ToastProvider>
        </WorkspaceConsistencyGuard>
      </AppProvider>
    </AuthProvider>
  )
}
