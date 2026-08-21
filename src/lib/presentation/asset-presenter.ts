import type { Asset, AssetType } from '@/lib/domain/types'

const TYPE_LABELS: Record<AssetType, string> = {
  image: '画像',
  video: '動画',
  audio: '音声',
  document: '資料',
}

export function assetTypeLabel(type: AssetType): string {
  return TYPE_LABELS[type]
}

export function formatAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`

  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

export function getPublishAssetsForSeed(assets: Asset[], seedId: string): Asset[] {
  return assets.filter((asset) => asset.seedId === seedId)
}

export function hasUsableAssetUrl(asset: Asset): boolean {
  return asset.url.trim().length > 0
}
