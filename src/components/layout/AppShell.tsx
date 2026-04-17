import type { User, Workspace, WorkspaceMember } from '@/lib/domain/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface AppShellProps {
  children: React.ReactNode
  user: User
  workspace: Workspace
  member: WorkspaceMember
  pageTitle?: string
}

export default function AppShell({ children, user, workspace, member, pageTitle }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-stone-50 overflow-hidden">
      <Sidebar workspace={workspace} user={user} member={member} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar workspace={workspace} pageTitle={pageTitle} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
