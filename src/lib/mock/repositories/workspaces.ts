import type {
  Invitation,
  SocialAccount,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'
import { createId, nowIso, withMemberRelations } from './helpers'

export function getUserWorkspaces(state: MockAppDataState, userId: string): Workspace[] {
  const membershipWorkspaceIds = new Set(
    state.members.filter((member) => member.userId === userId).map((member) => member.workspaceId),
  )

  return state.workspaces.filter((workspace) => membershipWorkspaceIds.has(workspace.id))
}

export function getCurrentWorkspace(state: MockAppDataState, userId: string): Workspace | null {
  const availableWorkspaces = getUserWorkspaces(state, userId)
  return (
    availableWorkspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ??
    availableWorkspaces[0] ??
    null
  )
}

export function getCurrentMember(
  state: MockAppDataState,
  workspaceId: string,
  userId: string,
): WorkspaceMember | null {
  const member = state.members.find(
    (entry) => entry.workspaceId === workspaceId && entry.userId === userId,
  )

  return member ? withMemberRelations(member, state.users) : null
}

export function setActiveWorkspace(state: MockAppDataState, workspaceId: string): MockAppDataState {
  return {
    ...state,
    activeWorkspaceId: workspaceId,
  }
}

export function listWorkspaceMembers(state: MockAppDataState, workspaceId: string): WorkspaceMember[] {
  return state.members
    .filter((member) => member.workspaceId === workspaceId)
    .map((member) => withMemberRelations(member, state.users))
}

export function listWorkspaceInvitations(state: MockAppDataState, workspaceId: string): Invitation[] {
  return state.invitations.filter((invitation) => invitation.workspaceId === workspaceId)
}

export function listWorkspaceSocialAccounts(state: MockAppDataState, workspaceId: string): SocialAccount[] {
  return state.socialAccounts.filter((account) => account.workspaceId === workspaceId)
}

export function inviteWorkspaceMember(
  state: MockAppDataState,
  params: { workspaceId: string; email: string; role: WorkspaceRole; invitedBy: string },
): { state: MockAppDataState; invitation: Invitation } {
  const invitation: Invitation = {
    id: createId('inv'),
    workspaceId: params.workspaceId,
    email: params.email.trim().toLowerCase(),
    role: params.role,
    status: 'pending',
    invitedBy: params.invitedBy,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  }

  return {
    state: {
      ...state,
      invitations: [invitation, ...state.invitations],
    },
    invitation,
  }
}

export function updateWorkspaceMemberRole(
  state: MockAppDataState,
  params: { workspaceId: string; userId: string; role: WorkspaceRole; actorId: string },
): { state: MockAppDataState; member: WorkspaceMember } {
  const member = state.members.find(
    (entry) => entry.workspaceId === params.workspaceId && entry.userId === params.userId,
  )

  if (!member) {
    throw new Error('Member not found.')
  }

  if (member.role === 'owner' && params.role !== 'owner') {
    throw new Error('Transfer ownership before changing the owner role.')
  }

  if (member.userId === params.actorId && member.role === 'owner' && params.role !== 'owner') {
    throw new Error('You cannot demote yourself while you own the workspace.')
  }

  const nextMember = { ...member, role: params.role }

  return {
    state: {
      ...state,
      members: state.members.map((entry) => (entry.id === member.id ? nextMember : entry)),
    },
    member: nextMember,
  }
}

export function removeWorkspaceMember(
  state: MockAppDataState,
  params: { workspaceId: string; userId: string; actorId: string },
): MockAppDataState {
  const member = state.members.find(
    (entry) => entry.workspaceId === params.workspaceId && entry.userId === params.userId,
  )

  if (!member) {
    throw new Error('Member not found.')
  }

  if (member.role === 'owner') {
    throw new Error('Owners cannot be removed without transferring ownership first.')
  }

  if (params.userId === params.actorId) {
    throw new Error('You cannot remove yourself from the workspace here.')
  }

  return {
    ...state,
    members: state.members.filter((entry) => entry.id !== member.id),
  }
}

export function updateWorkspaceDetails(
  state: MockAppDataState,
  params: { workspaceId: string; name: string; slug: string },
): { state: MockAppDataState; workspace: Workspace; previous: Workspace } {
  const workspace = state.workspaces.find((entry) => entry.id === params.workspaceId)
  if (!workspace) {
    throw new Error('Workspace not found.')
  }

  const nextWorkspace: Workspace = {
    ...workspace,
    name: params.name.trim(),
    slug: params.slug.trim().toLowerCase(),
    updatedAt: nowIso(),
  }

  return {
    state: {
      ...state,
      workspaces: state.workspaces.map((entry) => (entry.id === workspace.id ? nextWorkspace : entry)),
    },
    workspace: nextWorkspace,
    previous: workspace,
  }
}
