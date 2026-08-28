import { centerCropForAspect, type PixelCrop } from './crop'
import { countGraphemes } from './thumbnail-hook'

export const YOUTUBE_THUMB_WIDTH = 1280
export const YOUTUBE_THUMB_HEIGHT = 720
export const SHORT_COVER_WIDTH = 1080
export const SHORT_COVER_HEIGHT = 1920

export type ThumbnailTextAnchor = 'left' | 'right' | 'bottom' | 'top'

export interface ThumbnailOverlaySpec {
  width: number
  height: number
  hook: string
  fontSize: number
  strokeWidth: number
  fill: string
  stroke: string
  x: number
  y: number
  maxTextWidth: number
  fontFamily: string
  anchor: ThumbnailTextAnchor
  crop: PixelCrop
}

export const THUMBNAIL_FONT_STACK =
  '900 "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", YuGothic, Meiryo, sans-serif'

const YELLOW_FILL = '#FFE500'
const WHITE_FILL = '#FFFFFF'
const DARK_STROKE = '#111111'

export function youtubeThumbCrop(sourceWidth: number, sourceHeight: number): PixelCrop {
  return centerCropForAspect(sourceWidth, sourceHeight, YOUTUBE_THUMB_WIDTH / YOUTUBE_THUMB_HEIGHT)
}

export function shortCoverCrop(sourceWidth: number, sourceHeight: number): PixelCrop {
  return centerCropForAspect(sourceWidth, sourceHeight, SHORT_COVER_WIDTH / SHORT_COVER_HEIGHT)
}

/**
 * Letterboxing would pad the shorter axis with empty bars. We never do that —
 * the crop always uses one full source axis and trims the other.
 */
export function cropIsLetterboxed(crop: PixelCrop, sourceWidth: number, sourceHeight: number): boolean {
  const usesFullWidth = crop.sw >= sourceWidth - 0.5
  const usesFullHeight = crop.sh >= sourceHeight - 0.5
  return !usesFullWidth && !usesFullHeight
}

export function regionLumaVariance(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  region: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(imageWidth, Math.ceil(region.x + region.width))
  const imageHeight = pixels.length / (imageWidth * 4)
  const y1 = Math.min(imageHeight, Math.ceil(region.y + region.height))
  if (x1 <= x0 || y1 <= y0) return 0

  let count = 0
  let sum = 0
  let sumSq = 0
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * imageWidth + x) * 4
      const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      sum += luma
      sumSq += luma * luma
      count += 1
    }
  }
  if (count < 2) return 0
  const mean = sum / count
  return Math.max(0, sumSq / count - mean * mean)
}

export function regionMeanLuma(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  region: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(imageWidth, Math.ceil(region.x + region.width))
  const imageHeight = pixels.length / (imageWidth * 4)
  const y1 = Math.min(imageHeight, Math.ceil(region.y + region.height))
  let count = 0
  let sum = 0
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * imageWidth + x) * 4
      sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      count += 1
    }
  }
  return count === 0 ? 128 : sum / count
}

/**
 * Put huge text on the flatter side so a face/subject (higher variance) stays clear.
 */
export function chooseTextAnchor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  orientation: '16:9' | '9:16',
): ThumbnailTextAnchor {
  if (orientation === '9:16') {
    const top = regionLumaVariance(pixels, width, { x: 0, y: 0, width, height: height * 0.38 })
    const bottom = regionLumaVariance(pixels, width, { x: 0, y: height * 0.62, width, height: height * 0.38 })
    return top <= bottom ? 'top' : 'bottom'
  }

  const left = regionLumaVariance(pixels, width, { x: 0, y: 0, width: width * 0.42, height })
  const right = regionLumaVariance(pixels, width, { x: width * 0.58, y: 0, width: width * 0.42, height })
  return left <= right ? 'left' : 'right'
}

export function overlayFontSize(width: number, hook: string): number {
  const chars = Math.max(countGraphemes(hook), 1)
  const byWidth = (width * 0.88) / chars
  const byHeightCap = width * 0.22
  return Math.round(Math.min(Math.max(byWidth * 0.92, width * 0.08), byHeightCap))
}

export function overlayStrokeWidth(fontSize: number): number {
  return Math.max(10, Math.round(fontSize * 0.14))
}

export function pickFillForRegion(meanLuma: number): string {
  // Dark region → yellow; already-bright region → white. Both sit on a dark stroke.
  return meanLuma > 170 ? WHITE_FILL : YELLOW_FILL
}

function textPoint(width: number, height: number, anchor: ThumbnailTextAnchor): { x: number; y: number; maxTextWidth: number } {
  if (anchor === 'left') return { x: width * 0.28, y: height * 0.5, maxTextWidth: width * 0.5 }
  if (anchor === 'right') return { x: width * 0.72, y: height * 0.5, maxTextWidth: width * 0.5 }
  if (anchor === 'top') return { x: width * 0.5, y: height * 0.22, maxTextWidth: width * 0.9 }
  return { x: width * 0.5, y: height * 0.82, maxTextWidth: width * 0.9 }
}

export function buildThumbnailOverlaySpec(params: {
  orientation: '16:9' | '9:16'
  hook: string
  sourceWidth: number
  sourceHeight: number
  anchor?: ThumbnailTextAnchor
  fill?: string
}): ThumbnailOverlaySpec {
  const width = params.orientation === '16:9' ? YOUTUBE_THUMB_WIDTH : SHORT_COVER_WIDTH
  const height = params.orientation === '16:9' ? YOUTUBE_THUMB_HEIGHT : SHORT_COVER_HEIGHT
  const crop = params.orientation === '16:9'
    ? youtubeThumbCrop(params.sourceWidth, params.sourceHeight)
    : shortCoverCrop(params.sourceWidth, params.sourceHeight)
  const anchor = params.anchor ?? (params.orientation === '16:9' ? 'right' : 'top')
  const fontSize = overlayFontSize(width, params.hook)
  const point = textPoint(width, height, anchor)

  return {
    width,
    height,
    hook: params.hook,
    fontSize,
    strokeWidth: overlayStrokeWidth(fontSize),
    fill: params.fill ?? YELLOW_FILL,
    stroke: DARK_STROKE,
    x: point.x,
    y: point.y,
    maxTextWidth: point.maxTextWidth,
    fontFamily: THUMBNAIL_FONT_STACK,
    anchor,
    crop,
  }
}

export function candidateAnchors(orientation: '16:9' | '9:16'): ThumbnailTextAnchor[] {
  return orientation === '16:9' ? ['right', 'left', 'bottom'] : ['top', 'bottom', 'left']
}

export function scoreThumbnailCandidate(params: {
  timeRatio: number
  textRegionVariance: number
  subjectRegionVariance: number
}): number {
  const hero = 1 - Math.min(1, Math.abs(params.timeRatio - 0.4))
  const separation = params.subjectRegionVariance - params.textRegionVariance
  return hero * 2 + Math.max(0, separation) / 4000
}
