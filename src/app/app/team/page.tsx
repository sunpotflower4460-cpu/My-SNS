'use client'

import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import RoleBadge from '@/components/ui/RoleBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import PermissionGate from '@/components/ui/PermissionGate'
import { MOCK_MEMBERS, MOCK_INVITATIONS, CURRENT_MEMBER } from '@/lib/mock/seed'
import type { WorkspaceRole } from '@/lib/domain/types'

export default function TeamPage() {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer')
  const [inviteSent, setInviteSent] = useState(false)

  const handleInvite = () => {
    console.log('[Team] Invite:', { email: inviteEmail, role: inviteRole })
    setInviteSent(true)
    setInviteEmail('')
    setTimeout(() => setInviteSent(false), 3000)
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage workspace members and their roles."
      />

      {/* Member List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Members ({MOCK_MEMBERS.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {MOCK_MEMBERS.map((member) => (
            <div key={member.id} className="px-5 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-sm font-medium shrink-0">
                {member.user?.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{member.user?.name}</p>
                <p className="text-xs text-gray-500">{member.user?.email}</p>
              </div>
              <RoleBadge role={member.role} />
              <PermissionGate
                requiredPermission="change_roles"
                currentRole={CURRENT_MEMBER.role}
              >
                <select
                  defaultValue={member.role}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="contributor">Contributor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </PermissionGate>
              <PermissionGate
                requiredPermission="remove_members"
                currentRole={CURRENT_MEMBER.role}
              >
                {member.userId !== CURRENT_MEMBER.userId && (
                  <button className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg">
                    Remove
                  </button>
                )}
              </PermissionGate>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Section */}
      <PermissionGate
        requiredPermission="invite_members"
        currentRole={CURRENT_MEMBER.role}
        fallback={
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-500">
            You do not have permission to invite members.
          </div>
        }
      >
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Invite Member</h2>
          {inviteSent && (
            <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              ✓ Invitation sent!
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="contributor">Contributor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button
              onClick={handleInvite}
              className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"
            >
              Send Invite
            </button>
          </div>
        </div>
      </PermissionGate>

      {/* Pending Invitations */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Pending Invitations</h2>
        </div>
        {MOCK_INVITATIONS.filter((i) => i.status === 'pending').length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">No pending invitations.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {MOCK_INVITATIONS.filter((i) => i.status === 'pending').map((inv) => (
              <div key={inv.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <RoleBadge role={inv.role} />
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
