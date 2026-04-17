import type { WorkspaceRole } from '@/lib/domain/types'

interface RoleBadgeProps {
  role: WorkspaceRole
}

const ROLE_STYLES: Record<WorkspaceRole, string> = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  editor: 'bg-green-100 text-green-700 border-green-200',
  contributor: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  viewer: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_STYLES[role]}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}
