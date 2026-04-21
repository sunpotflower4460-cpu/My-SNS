import { useMockApp } from '@/lib/mock/store/provider'

export function useCurrentWorkspace() {
  const { currentWorkspace, currentMember, workspaceMemberships, workspaces, setActiveWorkspaceId } =
    useMockApp()

  return {
    currentWorkspace,
    currentMember,
    workspaceMemberships,
    workspaces,
    setActiveWorkspaceId,
  }
}
