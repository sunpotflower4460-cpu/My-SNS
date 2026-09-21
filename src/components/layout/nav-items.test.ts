import { describe, expect, it } from 'vitest'
import { canCreateSeed, getNavGroups } from './nav-items'

const hrefs = (role: Parameters<typeof getNavGroups>[0]) => getNavGroups(role).flatMap((group) => group.items.map((item) => item.href))

describe('getNavGroups', () => {
  it('hides 接続と設定 from roles without view_settings', () => {
    expect(hrefs('contributor')).not.toContain('/app/settings')
    expect(hrefs('owner')).toContain('/app/settings')
  })

  it('never returns a group with no items', () => {
    for (const role of ['owner', 'admin', 'editor', 'contributor', 'viewer'] as const) {
      expect(getNavGroups(role).every((group) => group.items.length > 0)).toBe(true)
    }
  })
})

describe('canCreateSeed', () => {
  it('follows the create_seeds permission', () => {
    expect(canCreateSeed('owner')).toBe(true)
    expect(canCreateSeed('contributor')).toBe(true)
    expect(canCreateSeed('viewer')).toBe(false)
  })
})
