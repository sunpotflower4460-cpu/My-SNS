import { describe, expect, it } from 'vitest'
import { hasPermission } from './index'

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
