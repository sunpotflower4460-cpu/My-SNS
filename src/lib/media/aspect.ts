import type { AssetAspectRatio, PublishingChannel } from '@/lib/domain/types'

const RATIO_TOLERANCE = 0.08

export function classifyAspectRatio(width: number, height: number): AssetAspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'other'

  const ratio = width / height
  const sixteenNine = 16 / 9
  const nineSixteen = 9 / 16

  if (Math.abs(ratio - 1) <= RATIO_TOLERANCE) return '1:1'
  if (Math.abs(ratio - sixteenNine) / sixteenNine <= RATIO_TOLERANCE) return '16:9'
  if (Math.abs(ratio - nineSixteen) / nineSixteen <= RATIO_TOLERANCE) return '9:16'
  return 'other'
}

/**
 * Empty array means "all channels" (legacy). Auto-assign only when we actually
 * know the aspect so a landscape master is never handed to Shorts/Reels/TikTok.
 */
export function suggestedPublishingChannelsForAspect(
  aspect: AssetAspectRatio | null | undefined,
  type: 'image' | 'video' | 'audio' | 'document',
): PublishingChannel[] {
  if (type !== 'video' || !aspect) return []
  if (aspect === '16:9') return ['youtube']
  if (aspect === '9:16') return ['youtube', 'instagram', 'tiktok']
  return []
}

export function aspectLabel(aspect: AssetAspectRatio | null | undefined): string {
  if (aspect === '16:9') return '16:9（横）'
  if (aspect === '9:16') return '9:16（縦）'
  if (aspect === '1:1') return '1:1'
  if (aspect === 'other') return 'その他の比率'
  return '比率未設定'
}

export async function detectFileAspectRatio(file: File): Promise<AssetAspectRatio | null> {
  if (file.type.startsWith('image/')) {
    const dimensions = await loadImageDimensions(file)
    return dimensions ? classifyAspectRatio(dimensions.width, dimensions.height) : null
  }
  if (file.type.startsWith('video/')) {
    const dimensions = await loadVideoDimensions(file)
    return dimensions ? classifyAspectRatio(dimensions.width, dimensions.height) : null
  }
  return null
}

function loadImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

function loadVideoDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ width: video.videoWidth, height: video.videoHeight })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    video.src = url
  })
}
