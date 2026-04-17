import type { WorkspaceRole } from '@/lib/domain/types'

// ─── Permission Definitions ───────────────────────────────────────────────────
export type Permission =
  | 'view_content'
  | 'create_content'
  | 'edit_content'
  | 'delete_content'
  | 'publish_content'
  | 'view_drafts'
  | 'create_drafts'
  | 'edit_drafts'
  | 'approve_drafts'
  | 'view_queue'
  | 'manage_queue'
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
    'view_content',
    'create_content',
    'edit_content',
    'delete_content',
    'publish_content',
    'view_drafts',
    'create_drafts',
    'edit_drafts',
    'approve_drafts',
    'view_queue',
    'manage_queue',
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
    'view_content',
    'create_content',
    'edit_content',
    'delete_content',
    'publish_content',
    'view_drafts',
    'create_drafts',
    'edit_drafts',
    'approve_drafts',
    'view_queue',
    'manage_queue',
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
    'view_content',
    'create_content',
    'edit_content',
    'view_drafts',
    'create_drafts',
    'edit_drafts',
    'approve_drafts',
    'view_queue',
    'view_inbox',
    'reply_inbox',
    'view_team',
    'view_settings',
    'upload_assets',
  ],
  contributor: [
    'view_content',
    'create_content',
    'view_drafts',
    'create_drafts',
    'view_queue',
    'view_inbox',
    'view_team',
    'upload_assets',
  ],
  viewer: [
    'view_content',
    'view_drafts',
    'view_queue',
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

export function canManageContent(role: WorkspaceRole): boolean {
  return hasPermission(role, 'edit_content')
}

export function canViewAuditLog(role: WorkspaceRole): boolean {
  return hasPermission(role, 'view_audit_log')
}

export function canPublish(role: WorkspaceRole): boolean {
  return hasPermission(role, 'publish_content')
}

export function canManageSettings(role: WorkspaceRole): boolean {
  return hasPermission(role, 'edit_settings')
}
