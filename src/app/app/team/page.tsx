'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import RoleBadge from '@/components/ui/RoleBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import PermissionGate from '@/components/ui/PermissionGate'
import { useMockApp } from '@/lib/app/app-provider'
import type { WorkspaceRole } from '@/lib/domain/types'

export default function TeamPage() {
  const { changeMemberRole, currentMember, currentWorkspace, inviteMember, invitations, members, removeMember } = useMockApp()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const pendingInvitations = useMemo(() => invitations.filter((invitation) => invitation.status === 'pending'), [invitations])

  const handleInvite = async () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase()

    if (!normalizedEmail) {
      setError('Enter an email address to invite someone.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }

    if (members.some((member) => member.user?.email.toLowerCase() === normalizedEmail)) {
      setError('That person is already in this workspace.')
      return
    }

    if (pendingInvitations.some((invitation) => invitation.email === normalizedEmail)) {
      setError('There is already a pending invitation for that email.')
      return
    }

    await inviteMember(normalizedEmail, inviteRole)
    setInviteEmail('')
    setInviteRole('viewer')
    setError('')
    setFeedback('Invitation added to local mock state.')
  }

  const handleRoleChange = async (userId: string, role: WorkspaceRole) => {
    try {
      await changeMemberRole(userId, role)
      setFeedback('Role updated.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update role.')
      setFeedback('')
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await removeMember(userId)
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
            <p className="mt-1 text-xs text-gray-500">Everyone listed here belongs to {currentWorkspace?.name ?? 'the active workspace'}.</p>
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
                    {isSelf && <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">You</span>}
                    <PermissionGate requiredPermission="change_roles" currentRole={currentMember?.role ?? 'viewer'}>
                      <select
                        value={member.role}
                        disabled={disableRoleChange}
                        onChange={(event) => handleRoleChange(member.userId, event.target.value as WorkspaceRole)}
                        className="rounded-2xl border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-gray-400"
                      >
                        {member.role === 'owner' && <option value="owner">Owner</option>}
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
            <p className="mb-4 text-sm leading-6 text-gray-500">New invites stay pending in local workspace state until real auth and invitations land in Phase 2.</p>
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
            <p className="mt-1 text-xs text-gray-500">Pending invites are workspace-specific and preserved locally.</p>
          </div>
          {pendingInvitations.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState title="No pending invitations" description="Invite a teammate when you need another person inside this workspace." icon="✉️" />
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{invitation.email}</p>
                    <p className="text-xs text-gray-400">
                      Pending · created {new Date(invitation.createdAt).toLocaleDateString()} · expires {new Date(invitation.expiresAt).toLocaleDateString()}
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
        </div>
      </div>
    </div>
  )
}
