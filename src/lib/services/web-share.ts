import type { Asset } from '@/lib/domain/types'
import { hasUsableAssetUrl } from '@/lib/presentation/asset-presenter'

export const WEB_SHARE_MEDIA_TYPES = ['image', 'video'] as const

export function getWebShareMediaAssets(assets: Asset[]): Asset[] {
  return assets.filter((asset) => WEB_SHARE_MEDIA_TYPES.includes(asset.type as (typeof WEB_SHARE_MEDIA_TYPES)[number]))
}

export function inferShareMimeType(asset: Pick<Asset, 'name' | 'type'>): string {
  const extension = asset.name.split('.').pop()?.toLowerCase()
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
  }

  if (extension && byExtension[extension]) return byExtension[extension]
  return asset.type === 'image' ? 'image/*' : asset.type === 'video' ? 'video/*' : 'application/octet-stream'
}

/**
 * Resolve Seed image/video assets into browser File objects for Web Share.
 * We intentionally fail if any intended media lacks a usable signed URL or
 * cannot be fetched: silently dropping one attachment could publish the wrong
 * post. The caller can then fall back to the existing open/download workflow.
 */
export async function prepareWebShareFiles(assets: Asset[]): Promise<File[]> {
  const mediaAssets = getWebShareMediaAssets(assets)
  if (mediaAssets.length === 0) return []

  const files: File[] = []
  for (const asset of mediaAssets) {
    if (!hasUsableAssetUrl(asset)) {
      throw new Error('共有する素材のURLを取得できませんでした。ページを更新して再試行してください。')
    }

    const response = await fetch(asset.url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`「${asset.name}」を共有用に取得できませんでした。`)
    }

    const blob = await response.blob()
    files.push(new File([blob], asset.name, {
      type: blob.type || inferShareMimeType(asset),
      lastModified: Date.now(),
    }))
  }

  return files
}
