import type { Invitation, WorkspaceMember } from '@/lib/domain/types'

// Pure presenter for the チーム page (UI-PR8). Invite validation and per-member
// action gating are extracted here so the rules are unit-testable and the page
// stays a thin view. No schema/route/permission change — the same checks, just
// centralised and tested.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type InviteValidation = { ok: true; email: string } | { ok: false; error: string }

export interface InviteValidationInput {
  email: string
  members: WorkspaceMember[]
  pendingInvitations: Invitation[]
}

/**
 * Validate an invite before it's sent: non-empty, well-formed, not already a
 * member, not already invited. Returns the normalised (trimmed/lowercased)
 * email on success, or the exact user-facing error on failure — same messages
 * and order as the old inline checks.
 */
export function validateInvite({ email, members, pendingInvitations }: InviteValidationInput): InviteValidation {
  const normalized = email.trim().toLowerCase()

  if (!normalized) return { ok: false, error: '招待する相手のメールアドレスを入力してください。' }
  if (!EMAIL_RE.test(normalized)) return { ok: false, error: '有効なメールアドレスを入力してください。' }
  if (members.some((member) => member.user?.email.toLowerCase() === normalized)) {
    return { ok: false, error: 'その方はすでにこのワークスペースのメンバーです。' }
  }
  if (pendingInvitations.some((invitation) => invitation.email === normalized)) {
    return { ok: false, error: 'そのメールアドレス宛の招待はすでに保留中です。' }
  }
  return { ok: true, email: normalized }
}

export interface MemberControls {
  isSelf: boolean
  /** The owner's role is fixed; the role select is disabled for owners. */
  disableRoleChange: boolean
  /** You can't remove yourself or the owner. */
  disableRemove: boolean
}

/** Which member-management controls are enabled for one row, given the viewer. */
export function getMemberControls(member: WorkspaceMember, currentUserId: string | undefined): MemberControls {
  const isSelf = member.userId === currentUserId
  const isOwner = member.role === 'owner'
  return { isSelf, disableRoleChange: isOwner, disableRemove: isSelf || isOwner }
}

/** Invitations still awaiting acceptance. */
export function getPendingInvitations(invitations: Invitation[]): Invitation[] {
  return invitations.filter((invitation) => invitation.status === 'pending')
}
