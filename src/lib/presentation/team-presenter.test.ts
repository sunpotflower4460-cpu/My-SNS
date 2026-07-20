import { describe, expect, it } from 'vitest'
import { getMemberControls, getPendingInvitations, validateInvite } from './team-presenter'
import type { Invitation, User, WorkspaceMember, WorkspaceRole } from '@/lib/domain/types'

function user(email: string): User {
  return { id: `u-${email}`, name: email.split('@')[0], email, createdAt: '2026-07-20T00:00:00Z' }
}

function member(over: Partial<WorkspaceMember> & { role: WorkspaceRole }): WorkspaceMember {
  return {
    id: `m-${over.userId ?? 'x'}`,
    workspaceId: 'w',
    userId: 'user-1',
    joinedAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function invitation(over: Partial<Invitation>): Invitation {
  return {
    id: 'inv1',
    workspaceId: 'w',
    email: 'a@example.com',
    role: 'viewer',
    status: 'pending',
    invitedBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    expiresAt: '2026-07-27T00:00:00Z',
    ...over,
  }
}

describe('validateInvite', () => {
  const base = { members: [] as WorkspaceMember[], pendingInvitations: [] as Invitation[] }

  it('rejects an empty email', () => {
    expect(validateInvite({ ...base, email: '  ' })).toEqual({ ok: false, error: expect.stringContaining('入力') })
  })

  it('rejects a malformed email', () => {
    expect(validateInvite({ ...base, email: 'not-an-email' })).toEqual({ ok: false, error: expect.stringContaining('有効な') })
  })

  it('normalises (trim + lowercase) a valid email', () => {
    expect(validateInvite({ ...base, email: '  New@Example.COM ' })).toEqual({ ok: true, email: 'new@example.com' })
  })

  it('rejects an email that is already a member (case-insensitive)', () => {
    const members = [member({ role: 'editor', user: user('taken@example.com') })]
    expect(validateInvite({ ...base, members, email: 'TAKEN@example.com' })).toEqual({
      ok: false,
      error: expect.stringContaining('すでにこのワークスペースのメンバー'),
    })
  })

  it('rejects an email that already has a pending invite', () => {
    const pendingInvitations = [invitation({ email: 'again@example.com' })]
    expect(validateInvite({ ...base, pendingInvitations, email: 'again@example.com' })).toEqual({
      ok: false,
      error: expect.stringContaining('すでに保留中'),
    })
  })
})

describe('getMemberControls', () => {
  it('disables role change and remove for the owner', () => {
    expect(getMemberControls(member({ role: 'owner', userId: 'owner-1' }), 'someone-else')).toEqual({
      isSelf: false,
      disableRoleChange: true,
      disableRemove: true,
    })
  })

  it('lets an admin change/remove another non-owner member', () => {
    expect(getMemberControls(member({ role: 'editor', userId: 'other' }), 'me')).toEqual({
      isSelf: false,
      disableRoleChange: false,
      disableRemove: false,
    })
  })

  it('marks self and blocks self-removal (role change still allowed if not owner)', () => {
    expect(getMemberControls(member({ role: 'editor', userId: 'me' }), 'me')).toEqual({
      isSelf: true,
      disableRoleChange: false,
      disableRemove: true,
    })
  })
})

describe('getPendingInvitations', () => {
  it('keeps only pending invitations', () => {
    const invitations = [
      invitation({ id: 'p', status: 'pending' }),
      invitation({ id: 'a', status: 'accepted' }),
      invitation({ id: 'e', status: 'expired' }),
    ]
    expect(getPendingInvitations(invitations).map((i) => i.id)).toEqual(['p'])
  })
})
