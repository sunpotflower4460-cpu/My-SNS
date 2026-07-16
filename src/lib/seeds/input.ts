import type { AssetType } from '@/lib/domain/types'

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

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return (value / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.round(value / 1024)) + ' KB'
}
