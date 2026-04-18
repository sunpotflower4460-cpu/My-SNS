'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import RoleBadge from '@/components/ui/RoleBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import PermissionGate from '@/components/ui/PermissionGate'
import { useMockApp } from '@/lib/mock/store/provider'
import type { WorkspaceRole } from '@/lib/domain/types'

export default function TeamPage() {
  const { changeMemberRole, currentMember, inviteMember, invitations, members, removeMember } = useMockApp()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const pendingInvitations = useMemo(() => invitations.filter((invitation) => invitation.status === 'pending'), [invitations])

  const handleInvite = () => {
    if (!inviteEmail.trim()) {
      setError('Enter an email address to invite someone.')
      return
    }

    inviteMember(inviteEmail, inviteRole)
    setInviteEmail('')
    setInviteRole('viewer')
    setError('')
    setFeedback('Invitation added to local mock state.')
  }

  const handleRoleChange = (userId: string, role: WorkspaceRole) => {
    try {
      changeMemberRole(userId, role)
      setFeedback('Role updated.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update role.')
      setFeedback('')
    }
  }

  const handleRemove = (userId: string) => {
    try {
      removeMember(userId)
      setFeedback('Member removed from the workspace.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove member.')
      setFeedback('')
    }
  }

  return (
    <div>
      <PageHeader title="Team" description="Manage workspace members, invitations, and role changes with local persistence." />

      {(feedback || error) && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>
          {error || feedback}
        </div>
      )}

      <div className="space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm shadow-stone-100/80">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Members ({members.length})</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {members.map((member) => {
              const isSelf = member.userId === currentMember?.userId
              const isOwner = member.role === 'owner'
              const disableRoleChange = isOwner || (isSelf && member.role === 'owner')
              const disableRemove = isSelf || isOwner

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
                    <PermissionGate requiredPermission="change_roles" currentRole={currentMember?.role ?? 'viewer'}>
                      <select
                        value={member.role}
                        disabled={disableRoleChange}
                        onChange={(event) => handleRoleChange(member.userId, event.target.value as WorkspaceRole)}
                        className="rounded-2xl border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-gray-400"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="contributor">Contributor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </PermissionGate>
                    <PermissionGate requiredPermission="remove_members" currentRole={currentMember?.role ?? 'viewer'}>
                      <button
                        onClick={() => handleRemove(member.userId)}
                        disabled={disableRemove}
                        className="rounded-2xl border border-red-200 px-3 py-2 text-xs text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-gray-400"
                      >
                        Remove
                      </button>
                    </PermissionGate>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <PermissionGate
          requiredPermission="invite_members"
          currentRole={currentMember?.role ?? 'viewer'}
          fallback={<div className="rounded-[2rem] border border-stone-200 bg-stone-50 p-5 text-sm text-gray-500">You do not have permission to invite members.</div>}
        >
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Invite teammate</h2>
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
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="contributor">Contributor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button onClick={handleInvite} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700">Send Invite</button>
            </div>
          </div>
        </PermissionGate>

        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm shadow-stone-100/80">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Pending invitations</h2>
          </div>
          {pendingInvitations.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">No pending invitations.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{invitation.email}</p>
                    <p className="text-xs text-gray-400">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={invitation.role} />
                    <StatusBadge status={invitation.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
