import type { WorkspaceRole } from '@/lib/domain/types'
import type { Permission } from '@/lib/permissions'
import { hasPermission } from '@/lib/permissions'

interface PermissionGateProps {
  requiredPermission: Permission
  currentRole: WorkspaceRole
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function PermissionGate({
  requiredPermission,
  currentRole,
  children,
  fallback = null,
}: PermissionGateProps) {
  if (!hasPermission(currentRole, requiredPermission)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
