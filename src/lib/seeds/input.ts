import type { AssetType, SeedKind } from '@/lib/domain/types'

export function normalizeTags(input: string | string[]): string[] {
  const values = Array.isArray(input) ? input : input.split(',')

  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

export function inferAssetType(name: string, mimeType?: string): AssetType {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'

  const extension = name.split('.').pop()?.toLowerCase()
  if (extension && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(extension)) return 'image'
  if (extension && ['mp4', 'mov', 'webm', 'm4v'].includes(extension)) return 'video'
  if (extension && ['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(extension)) return 'audio'
  return 'document'
}

export function inferSeedKindFromFiles(types: AssetType[], hasSourceText: boolean): SeedKind {
  const unique = new Set(types.filter((type) => type !== 'document'))
  if (unique.size === 0) return 'text'
  if (unique.size > 1) return 'mixed'
  if (unique.has('video')) return 'video'
  if (unique.has('audio')) return 'music'
  if (unique.has('image')) return hasSourceText ? 'mixed' : 'image'
  return 'text'
}

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return (value / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB'
  if (value < 1024) return Math.max(0, Math.round(value)) + ' B'
  return Math.round(value / 1024) + ' KB'
}
