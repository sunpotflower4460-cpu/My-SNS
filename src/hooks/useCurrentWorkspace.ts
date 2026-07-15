import { useApp } from '@/lib/app/app-provider'

export function useCurrentWorkspace() {
  const { currentWorkspace, currentMember, workspaceMemberships, workspaces, setActiveWorkspaceId } =
    useApp()

  return {
    currentWorkspace,
    currentMember,
    workspaceMemberships,
    workspaces,
    setActiveWorkspaceId,
  }
}
