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

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'オーナー',
  admin: '管理者',
  editor: '編集者',
  contributor: '投稿者',
  viewer: '閲覧者',
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.05em] ${ROLE_STYLES[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  )
}
