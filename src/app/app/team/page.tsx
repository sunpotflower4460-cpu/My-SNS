'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import RoleBadge from '@/components/ui/RoleBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import PermissionGate from '@/components/ui/PermissionGate'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { getMemberControls, getPendingInvitations, validateInvite } from '@/lib/presentation/team-presenter'
import type { WorkspaceRole } from '@/lib/domain/types'

export default function TeamPage() {
  const { changeMemberRole, currentMember, currentWorkspace, inviteMember, invitations, members, removeMember } = useApp()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const pendingInvitations = useMemo(() => getPendingInvitations(invitations), [invitations])

  const handleInvite = async () => {
    const validation = validateInvite({ email: inviteEmail, members, pendingInvitations })
    if (!validation.ok) {
      setError(validation.error)
      // Clear any stale success message so the two alerts never contradict.
      setFeedback('')
      return
    }

    setIsInviting(true)
    try {
      await inviteMember(validation.email, inviteRole)
      setInviteEmail('')
      setInviteRole('viewer')
      setError('')
      setFeedback('このワークスペースに招待を保存しました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '招待を作成できませんでした。')
      setFeedback('')
    } finally {
      setIsInviting(false)
    }
  }

  const handleRoleChange = async (userId: string, role: WorkspaceRole) => {
    setBusyUserId(userId)
    try {
      await changeMemberRole(userId, role)
      setFeedback('役割を更新しました。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '役割を更新できませんでした。')
      setFeedback('')
    } finally {
      setBusyUserId(null)
    }
  }

  const handleRemove = async (userId: string) => {
    setBusyUserId(userId)
    try {
      await removeMember(userId)
      setFeedback('メンバーをワークスペースから削除しました。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'メンバーを削除できませんでした。')
      setFeedback('')
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <div>
      <PageHeader title="チーム" description="ワークスペースのメンバー・招待・役割の変更を管理します。" />

      {feedback && <div className="mb-5"><InlineAlert tone="success">{feedback}</InlineAlert></div>}
      {error && <div className="mb-5"><InlineAlert tone="error">{error}</InlineAlert></div>}

      <div className="space-y-6">
        <Card size="container" padded={false} className="overflow-hidden">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">メンバー（{members.length}人）</h2>
            <p className="mt-1 text-xs text-gray-500">{currentWorkspace?.name ?? '現在のワークスペース'}に所属するメンバー一覧です。</p>
          </div>
          <div className="divide-y divide-stone-100">
            {members.map((member) => {
              const { isSelf, disableRoleChange, disableRemove } = getMemberControls(member, currentMember?.userId)
              return (
                <div key={member.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-medium text-violet-700">
                      {member.user?.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{member.user?.name}</p>
                      <p className="truncate text-xs text-gray-500">{member.user?.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:justify-end">
                    <RoleBadge role={member.role} />
                    {isSelf && <Badge tone="neutral">自分</Badge>}
                    <PermissionGate requiredPermission="change_roles" currentRole={currentMember?.role ?? 'viewer'}>
                      <select
                        value={member.role}
                        disabled={disableRoleChange || busyUserId === member.userId}
                        onChange={(event) => void handleRoleChange(member.userId, event.target.value as WorkspaceRole)}
                        className="min-h-touch rounded-control border border-stone-200 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-gray-400 sm:min-h-control"
                      >
                        {member.role === 'owner' && <option value="owner">オーナー</option>}
                        <option value="admin">管理者</option>
                        <option value="editor">編集者</option>
                        <option value="contributor">投稿者</option>
                        <option value="viewer">閲覧者</option>
                      </select>
                    </PermissionGate>
                    <PermissionGate requiredPermission="remove_members" currentRole={currentMember?.role ?? 'viewer'}>
                      <Button size="sm" variant="destructive" onClick={() => void handleRemove(member.userId)} disabled={disableRemove || busyUserId === member.userId}>
                        削除
                      </Button>
                    </PermissionGate>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <PermissionGate
          requiredPermission="invite_members"
          currentRole={currentMember?.role ?? 'viewer'}
          fallback={<Card size="container" tone="muted"><p className="text-sm text-gray-500">メンバーを招待する権限がありません。</p></Card>}
        >
          <Card size="container" padded>
            <h2 className="mb-4 text-base font-semibold text-gray-900">チームメンバーを招待</h2>
            <p className="mb-4 text-sm leading-6 text-gray-500">招待の承認・受諾フローが実装されるまで、招待は保留中のままになります。</p>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}
                className="rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="admin">管理者</option>
                <option value="editor">編集者</option>
                <option value="contributor">投稿者</option>
                <option value="viewer">閲覧者</option>
              </select>
              <Button variant="primary" onClick={() => void handleInvite()} loading={isInviting}>招待を送る</Button>
            </div>
          </Card>
        </PermissionGate>

        <Card size="container" padded={false} className="overflow-hidden">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">保留中の招待</h2>
            <p className="mt-1 text-xs text-gray-500">保留中の招待はワークスペースごとに管理され、ローカルに保存されます。</p>
          </div>
          {pendingInvitations.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState title="保留中の招待はありません" description="ワークスペースに新しいメンバーが必要になったら、招待しましょう。" icon="✉️" />
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{invitation.email}</p>
                    <p className="text-xs text-gray-400">
                      保留中 · 作成日 {new Date(invitation.createdAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })} · 有効期限 {new Date(invitation.expiresAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={invitation.role} />
                    <StatusBadge status={invitation.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
