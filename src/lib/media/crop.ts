export interface PixelCrop {
  sx: number
  sy: number
  sw: number
  sh: number
  outputWidth: number
  outputHeight: number
}

export function centerCropForAspect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
): PixelCrop {
  const sourceAspect = sourceWidth / sourceHeight
  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceAspect > targetAspect) {
    sw = sourceHeight * targetAspect
    sx = (sourceWidth - sw) / 2
  } else if (sourceAspect < targetAspect) {
    sh = sourceWidth / targetAspect
    sy = (sourceHeight - sh) / 2
  }

  const outputWidth = Math.round(sw)
  const outputHeight = Math.round(sh)
  return { sx, sy, sw, sh, outputWidth, outputHeight }
}

export async function exportCroppedImage(file: File, crop: PixelCrop, mimeType = 'image/jpeg', quality = 0.92): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = crop.outputWidth
  canvas.height = crop.outputHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('このブラウザでは画像の切り出しに対応していません。')
  context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.outputWidth, crop.outputHeight)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('画像の書き出しに失敗しました。'))
      else resolve(blob)
    }, mimeType, quality)
  })
}

function pickRecorderMimeType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? ''
}

/**
 * Center-crops a video to 16:9 or 9:16 in the browser via canvas + MediaRecorder.
 * Output is typically WebM. Platforms that reject WebM still need an uploaded MP4.
 */
export async function exportCroppedVideo(file: File, targetAspect: number, onProgress?: (ratio: number) => void): Promise<Blob> {
  const mimeType = pickRecorderMimeType()
  if (!mimeType) {
    throw new Error('このブラウザでは動画の切り出しに対応していません。16:9 / 9:16 のファイルを別途アップロードしてください。')
  }

  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.src = objectUrl

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('動画の読み込みに失敗しました。'))
  })

  const crop = centerCropForAspect(video.videoWidth, video.videoHeight, targetAspect)
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(crop.outputWidth, 1080)
  canvas.height = Math.round(canvas.width / targetAspect)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('このブラウザでは動画の切り出しに対応していません。')

  const stream = canvas.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('動画の書き出しに失敗しました。'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  recorder.start(200)
  await video.play()

  await new Promise<void>((resolve) => {
    const draw = () => {
      if (video.ended || video.paused) {
        resolve()
        return
      }
      context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)
      onProgress?.(video.duration > 0 ? video.currentTime / video.duration : 0)
      requestAnimationFrame(draw)
    }
    draw()
    video.onended = () => resolve()
  })

  if (recorder.state !== 'inactive') recorder.stop()
  URL.revokeObjectURL(objectUrl)
  return finished
}

export async function captureVideoStill(file: File, timeSeconds = 1): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.src = objectUrl

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('動画の読み込みに失敗しました。'))
  })

  video.currentTime = Math.min(Math.max(timeSeconds, 0), Number.isFinite(video.duration) ? video.duration : timeSeconds)
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve()
  })

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('このブラウザではサムネイル切り出しに対応していません。')
  context.drawImage(video, 0, 0)
  URL.revokeObjectURL(objectUrl)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('サムネイルの書き出しに失敗しました。'))
      else resolve(blob)
    }, 'image/jpeg', 0.92)
  })
}
