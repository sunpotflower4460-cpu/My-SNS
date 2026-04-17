import { useMockApp } from '@/lib/mock/store/provider'

export function useCurrentWorkspace() {
  const { currentWorkspace, currentMember, workspaces, setActiveWorkspaceId } = useMockApp()

  return {
    currentWorkspace,
    currentMember,
    workspaces,
    setActiveWorkspaceId,
  }
}
