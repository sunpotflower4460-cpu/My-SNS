import { describe, expect, it } from 'vitest'
import { hasPermission } from './index'
import type { WorkspaceRole } from '@/lib/domain/types'

const ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'contributor', 'viewer']

describe('asset permissions', () => {
  it('keeps upload permissions aligned with asset RLS', () => {
    expect(hasPermission('owner', 'upload_assets')).toBe(true)
    expect(hasPermission('admin', 'upload_assets')).toBe(true)
    expect(hasPermission('editor', 'upload_assets')).toBe(true)
    expect(hasPermission('contributor', 'upload_assets')).toBe(true)
    expect(hasPermission('viewer', 'upload_assets')).toBe(false)
  })

  it('keeps delete permissions aligned with asset RLS', () => {
    expect(hasPermission('owner', 'delete_assets')).toBe(true)
    expect(hasPermission('admin', 'delete_assets')).toBe(true)
    expect(hasPermission('editor', 'delete_assets')).toBe(true)
    expect(hasPermission('contributor', 'delete_assets')).toBe(false)
    expect(hasPermission('viewer', 'delete_assets')).toBe(false)
  })
})

describe('shadow strategy permissions', () => {
  it('lets owner view and import', () => {
    expect(hasPermission('owner', 'view_shadow_strategy')).toBe(true)
    expect(hasPermission('owner', 'manage_shadow_strategy')).toBe(true)
  })

  it('lets admin view and import', () => {
    expect(hasPermission('admin', 'view_shadow_strategy')).toBe(true)
    expect(hasPermission('admin', 'manage_shadow_strategy')).toBe(true)
  })

  it('blocks editor, contributor, and viewer', () => {
    for (const role of ['editor', 'contributor', 'viewer'] as const) {
      expect(hasPermission(role, 'view_shadow_strategy')).toBe(false)
      expect(hasPermission(role, 'manage_shadow_strategy')).toBe(false)
    }
  })

  it('does not grant shadow permissions by accident to every existing role list', () => {
    const allowed = ROLES.filter((role) => hasPermission(role, 'view_shadow_strategy'))
    expect(allowed).toEqual(['owner', 'admin'])
  })
})
