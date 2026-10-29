import { centerCropForAspect } from './crop'
import type { ThumbnailOverlaySpec } from './thumbnail-layout'

export interface OverlayCanvasContext {
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  lineJoin: string
  miterLimit: number
  font: string
  textAlign: string
  textBaseline: string
  save(): void
  restore(): void
  fillText(text: string, x: number, y: number, maxWidth?: number): void
  strokeText(text: string, x: number, y: number, maxWidth?: number): void
}

const MIN_SUCCESSFUL_JPEG_BYTES = 4096

/**
 * High-contrast Japanese YouTube overlay: huge fill + thick dark stroke.
 * Callers must already have drawn the still. Failed glyph draws are the
 * caller's problem — this function always issues stroke then fill.
 */
export function drawThumbnailOverlay(context: OverlayCanvasContext, spec: ThumbnailOverlaySpec): void {
  if (!spec.hook) {
    throw new Error('フック文言が空のため、文字入りサムネイルを描けません。')
  }

  context.save()
  context.font = `900 ${spec.fontSize}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", YuGothic, Meiryo, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.miterLimit = 2
  context.lineWidth = spec.strokeWidth
  context.strokeStyle = spec.stroke
  context.fillStyle = spec.fill
  context.strokeText(spec.hook, spec.x, spec.y, spec.maxTextWidth)
  context.fillText(spec.hook, spec.x, spec.y, spec.maxTextWidth)
  context.restore()
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('オーバーレイの書き出しに失敗しました。この結果はサムネイルとして使いません。'))
      else resolve(blob)
    }, 'image/jpeg', quality)
  })
}

/**
 * Draw a still, center-cropped (never letterboxed) to the spec size, then overlay hook text.
 */
export async function composeTextInImageThumbnail(still: Blob, spec: ThumbnailOverlaySpec): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('この環境では文字入りサムネイルを描けません。')
  }

  const bitmap = await createImageBitmap(still)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = spec.width
    canvas.height = spec.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('このブラウザでは文字入りサムネイルに対応していません。')

    const crop = spec.crop.sw > 0
      ? spec.crop
      : centerCropForAspect(bitmap.width, bitmap.height, spec.width / spec.height)
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, spec.width, spec.height)
    drawThumbnailOverlay(context, spec)

    const blob = await canvasToJpeg(canvas)
    if (blob.size < MIN_SUCCESSFUL_JPEG_BYTES) {
      throw new Error('オーバーレイに失敗したため、このサムネイルは使いません。PNG/JPGをアップロードしてください。')
    }
    return blob
  } finally {
    bitmap.close()
  }
}
