import { describe, expect, it } from 'vitest'
import { buildAssetStoragePath, getSafeAssetExtension } from './asset-path'

describe('private asset paths', () => {
  it('keeps only a short safe extension', () => {
    expect(getSafeAssetExtension('Cover.Final.PNG')).toBe('png')
    expect(getSafeAssetExtension('../secret')).toBe('')
    expect(getSafeAssetExtension('file.reallylongextension')).toBe('')
  })

  it('always scopes an object below workspace and content ids', () => {
    expect(buildAssetStoragePath({
      workspaceId: 'workspace-id',
      contentId: 'content-id',
      assetId: 'asset-id',
      fileName: '../../cover.JPG',
    })).toBe('workspace-id/content-id/asset-id.jpg')
  })
})
