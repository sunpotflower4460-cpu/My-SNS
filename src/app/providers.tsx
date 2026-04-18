'use client'

import { MockAppProvider } from '@/lib/mock/store/provider'
import { MockSessionProvider } from '@/lib/session/mock-session'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MockSessionProvider>
      <MockAppProvider>{children}</MockAppProvider>
    </MockSessionProvider>
  )
}
