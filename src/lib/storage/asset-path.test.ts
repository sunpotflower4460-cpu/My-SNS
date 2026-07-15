import { describe, expect, it } from 'vitest'
import { buildAssetStoragePath, getSafeAssetExtension } from './asset-path'

describe('private asset paths', () => {
  it('keeps only a short safe extension', () => {
    expect(getSafeAssetExtension('Cover.Final.PNG')).toBe('png')
    expect(getSafeAssetExtension('../secret')).toBe('')
    expect(getSafeAssetExtension('file.reallylongextension')).toBe('')
  })

  it('always scopes an object below workspace and Seed ids', () => {
    expect(buildAssetStoragePath({
      workspaceId: 'workspace-id',
      seedId: 'seed-id',
      assetId: 'asset-id',
      fileName: '../../cover.JPG',
    })).toBe('workspace-id/seed-id/asset-id.jpg')
  })
})
