import type { WorkspaceRole } from '@/lib/domain/types'

// ─── Permission Definitions ───────────────────────────────────────────────────
export type Permission =
  | 'view_seeds'
  | 'create_seeds'
  | 'edit_seeds'
  | 'delete_seeds'
  | 'approve_publishing'
  | 'edit_brand_profile'
  | 'view_drafts'
  | 'create_drafts'
  | 'edit_drafts'
  | 'approve_drafts'
  | 'view_queue'
  | 'manage_queue'
  | 'view_analytics'
  | 'view_inbox'
  | 'reply_inbox'
  | 'view_team'
  | 'invite_members'
  | 'remove_members'
  | 'change_roles'
  | 'view_settings'
  | 'edit_settings'
  | 'manage_social_accounts'
  | 'view_audit_log'
  | 'upload_assets'
  | 'delete_assets'
  | 'transfer_ownership'
  | 'delete_workspace'

// ─── Role → Permission Map ────────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: [
    'view_seeds',
    'create_seeds',
    'edit_seeds',
    'delete_seeds',
    'approve_publishing',
    'edit_brand_profile',
    'view_drafts',
    'create_drafts',
    'edit_drafts',
    'approve_drafts',
    'view_queue',
    'manage_queue',
    'view_analytics',
    'view_inbox',
    'reply_inbox',
    'view_team',
    'invite_members',
    'remove_members',
    'change_roles',
    'view_settings',
    'edit_settings',
    'manage_social_accounts',
    'view_audit_log',
    'upload_assets',
    'delete_assets',
    'transfer_ownership',
    'delete_workspace',
  ],
  admin: [
    'view_seeds',
    'create_seeds',
    'edit_seeds',
    'delete_seeds',
    'approve_publishing',
    'edit_brand_profile',
    'view_drafts',
    'create_drafts',
    'edit_drafts',
    'approve_drafts',
    'view_queue',
    'manage_queue',
    'view_analytics',
    'view_inbox',
    'reply_inbox',
    'view_team',
    'invite_members',
    'remove_members',
    'change_roles',
    'view_settings',
    'edit_settings',
    'manage_social_accounts',
    'view_audit_log',
    'upload_assets',
    'delete_assets',
  ],
  editor: [
    'view_seeds',
    'create_seeds',
    'edit_seeds',
    'edit_brand_profile',
    'view_drafts',
    'create_drafts',
    'edit_drafts',
    'approve_drafts',
    'view_queue',
    'view_analytics',
    'view_inbox',
    'reply_inbox',
    'view_team',
    'view_settings',
    'upload_assets',
  ],
  contributor: [
    'view_seeds',
    'create_seeds',
    'view_drafts',
    'create_drafts',
    'view_queue',
    'view_analytics',
    'view_inbox',
    'view_team',
    'upload_assets',
  ],
  viewer: [
    'view_seeds',
    'view_drafts',
    'view_queue',
    'view_analytics',
    'view_inbox',
    'view_team',
    'view_settings',
  ],
}

// ─── Helper Functions ─────────────────────────────────────────────────────────
export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return hasPermission(role, 'invite_members') || hasPermission(role, 'remove_members')
}

export function canManageSeeds(role: WorkspaceRole): boolean {
  return hasPermission(role, 'edit_seeds')
}

export function canViewAuditLog(role: WorkspaceRole): boolean {
  return hasPermission(role, 'view_audit_log')
}

export function canPublish(role: WorkspaceRole): boolean {
  return hasPermission(role, 'approve_publishing')
}

export function canManageSettings(role: WorkspaceRole): boolean {
  return hasPermission(role, 'edit_settings')
}
