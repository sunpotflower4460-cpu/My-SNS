import { centerCropForAspect } from './crop'

export interface CapturedStill {
  blob: Blob
  timeSeconds: number
  timeRatio: number
  width: number
  height: number
}

const STILL_RATIOS = [0.12, 0.4, 0.68]

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = objectUrl
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('動画の読み込みに失敗しました。'))
    }
  })
}

function seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('動画の指定位置へ移動できませんでした。'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = timeSeconds
  })
}

function frameToBlob(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  if (canvas.width < 2 || canvas.height < 2) {
    return Promise.reject(new Error('動画フレームのサイズが不正なため、静止画を切り出せません。'))
  }
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('このブラウザでは静止画の切り出しに対応していません。'))
  context.drawImage(video, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('静止画の書き出しに失敗しました。'))
      else resolve(blob)
    }, 'image/jpeg', 0.92)
  })
}

/**
 * Grab 1–3 candidate stills from a video. Empty result means generation must
 * skip with a visible reason — never invent a black frame.
 */
export async function captureCandidateStills(file: File, count = 3): Promise<CapturedStill[]> {
  if (typeof document === 'undefined') {
    throw new Error('静止画の切り出しはブラウザでのみ実行できます。')
  }

  const video = await loadVideo(file)
  const objectUrl = video.src
  try {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return []
    }

    const ratios = STILL_RATIOS.slice(0, Math.min(Math.max(count, 1), STILL_RATIOS.length))
    const stills: CapturedStill[] = []

    for (const ratio of ratios) {
      const timeSeconds = Math.min(Math.max(video.duration * ratio, 0.04), Math.max(video.duration - 0.04, 0.04))
      try {
        await seekVideo(video, timeSeconds)
        const blob = await frameToBlob(video)
        stills.push({
          blob,
          timeSeconds,
          timeRatio: ratio,
          width: video.videoWidth,
          height: video.videoHeight,
        })
      } catch {
        // One bad seek does not invent a frame; try the next timestamp.
      }
    }

    return stills
  } finally {
    URL.revokeObjectURL(objectUrl)
    video.src = ''
    video.load()
  }
}

/** Center-crop a still blob to a target aspect. Never letterboxes. */
export async function cropStillBlob(still: Blob, targetAspect: number): Promise<Blob> {
  const bitmap = await createImageBitmap(still)
  try {
    const crop = centerCropForAspect(bitmap.width, bitmap.height, targetAspect)
    const canvas = document.createElement('canvas')
    canvas.width = crop.outputWidth
    canvas.height = crop.outputHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('このブラウザでは静止画の切り出しに対応していません。')
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.outputWidth, crop.outputHeight)
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('切り出した静止画の書き出しに失敗しました。'))
        else resolve(blob)
      }, 'image/jpeg', 0.92)
    })
  } finally {
    bitmap.close()
  }
}
