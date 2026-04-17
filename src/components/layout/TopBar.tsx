import type { Workspace } from '@/lib/domain/types'
import WorkspaceSwitcher from './WorkspaceSwitcher'

interface TopBarProps {
  workspace: Workspace
  pageTitle?: string
}

export default function TopBar({ workspace, pageTitle }: TopBarProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="text-gray-400">{workspace.name}</span>
        {pageTitle && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 font-medium">{pageTitle}</span>
          </>
        )}
      </div>
      <WorkspaceSwitcher workspace={workspace} />
    </header>
  )
}
