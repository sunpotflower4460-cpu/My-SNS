import AppShell from '@/components/layout/AppShell'
import { CURRENT_USER, CURRENT_WORKSPACE, CURRENT_MEMBER } from '@/lib/mock/seed'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      user={CURRENT_USER}
      workspace={CURRENT_WORKSPACE}
      member={CURRENT_MEMBER}
    >
      {children}
    </AppShell>
  )
}
