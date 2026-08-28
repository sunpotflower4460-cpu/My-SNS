import { describe, expect, it } from 'vitest'
import {
  buildThumbnailOverlaySpec,
  candidateAnchors,
  chooseTextAnchor,
  cropIsLetterboxed,
  overlayFontSize,
  overlayStrokeWidth,
  shortCoverCrop,
  SHORT_COVER_HEIGHT,
  SHORT_COVER_WIDTH,
  youtubeThumbCrop,
  YOUTUBE_THUMB_HEIGHT,
  YOUTUBE_THUMB_WIDTH,
} from './thumbnail-layout'

describe('thumbnail overlay recipe', () => {
  it('builds a 1280×720 YouTube spec with huge text and a thick dark stroke', () => {
    const spec = buildThumbnailOverlaySpec({
      orientation: '16:9',
      hook: '無料公開',
      sourceWidth: 1920,
      sourceHeight: 1080,
    })
    expect(spec.width).toBe(YOUTUBE_THUMB_WIDTH)
    expect(spec.height).toBe(YOUTUBE_THUMB_HEIGHT)
    expect(spec.hook).toBe('無料公開')
    expect(spec.fontSize).toBeGreaterThanOrEqual(96)
    expect(spec.strokeWidth).toBeGreaterThanOrEqual(12)
    expect(spec.stroke).toBe('#111111')
    expect(spec.fill).toMatch(/^#/)
    expect(cropIsLetterboxed(spec.crop, 1920, 1080)).toBe(false)
  })

  it('builds a 9:16 cover spec from a portrait frame without letterboxing', () => {
    const spec = buildThumbnailOverlaySpec({
      orientation: '9:16',
      hook: '今すぐ',
      sourceWidth: 1080,
      sourceHeight: 1920,
    })
    expect(spec.width).toBe(SHORT_COVER_WIDTH)
    expect(spec.height).toBe(SHORT_COVER_HEIGHT)
    expect(cropIsLetterboxed(spec.crop, 1080, 1920)).toBe(false)
    expect(spec.crop.sw / spec.crop.sh).toBeCloseTo(9 / 16, 5)
  })

  it('crops a landscape master to 9:16 instead of adding letterbox bars', () => {
    const crop = shortCoverCrop(1920, 1080)
    expect(crop.sw / crop.sh).toBeCloseTo(9 / 16, 5)
    expect(crop.sh).toBe(1080)
    expect(crop.sx).toBeGreaterThan(0)
    expect(cropIsLetterboxed(crop, 1920, 1080)).toBe(false)
  })

  it('crops a portrait master to 16:9 without padding', () => {
    const crop = youtubeThumbCrop(1080, 1920)
    expect(crop.sw / crop.sh).toBeCloseTo(16 / 9, 5)
    expect(crop.sw).toBe(1080)
    expect(cropIsLetterboxed(crop, 1080, 1920)).toBe(false)
  })

  it('puts text on the flatter side so a busy/face region stays clear', () => {
    const width = 40
    const height = 20
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        const noisy = x >= width / 2 ? (x * 17 + y * 31) % 256 : 120
        pixels[i] = noisy
        pixels[i + 1] = noisy
        pixels[i + 2] = noisy
        pixels[i + 3] = 255
      }
    }
    expect(chooseTextAnchor(pixels, width, height, '16:9')).toBe('left')
  })

  it('scales font down for 8 characters so the line still fits', () => {
    expect(overlayFontSize(1280, 'あいうえおかきく')).toBeLessThan(overlayFontSize(1280, '今すぐ'))
    expect(overlayStrokeWidth(100)).toBeGreaterThanOrEqual(14)
  })

  it('offers three layout variants for 16:9 candidates', () => {
    expect(candidateAnchors('16:9')).toEqual(['right', 'left', 'bottom'])
  })
})
