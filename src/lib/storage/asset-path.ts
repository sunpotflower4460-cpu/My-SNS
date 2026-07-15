const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/i

export function getSafeAssetExtension(fileName: string): string {
  const extension = fileName.split('.').pop()
  return extension && SAFE_EXTENSION.test(extension) ? extension.toLowerCase() : ''
}

export function buildAssetStoragePath(params: {
  workspaceId: string
  contentId: string
  assetId: string
  fileName: string
}): string {
  const extension = getSafeAssetExtension(params.fileName)
  const suffix = extension ? '.' + extension : ''
  return [params.workspaceId, params.contentId, params.assetId + suffix].join('/')
}
