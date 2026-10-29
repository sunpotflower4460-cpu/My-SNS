import { describe, expect, it } from 'vitest'
import { drawThumbnailOverlay, type OverlayCanvasContext } from './thumbnail-compose'
import { buildThumbnailOverlaySpec } from './thumbnail-layout'

function mockContext(): OverlayCanvasContext & { strokes: string[]; fills: string[] } {
  const strokes: string[] = []
  const fills: string[] = []
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: 'miter',
    miterLimit: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    strokes,
    fills,
    save() {},
    restore() {},
    strokeText(text: string) { strokes.push(text) },
    fillText(text: string) { fills.push(text) },
  }
}

describe('drawThumbnailOverlay', () => {
  it('strokes then fills the hook so the dark outline sits behind huge type', () => {
    const spec = buildThumbnailOverlaySpec({
      orientation: '16:9',
      hook: '無料公開',
      sourceWidth: 1920,
      sourceHeight: 1080,
    })
    const context = mockContext()
    drawThumbnailOverlay(context, spec)
    expect(context.strokes).toEqual(['無料公開'])
    expect(context.fills).toEqual(['無料公開'])
    expect(context.lineWidth).toBe(spec.strokeWidth)
    expect(context.strokeStyle).toBe('#111111')
    expect(context.fillStyle).toBe(spec.fill)
    expect(context.font).toMatch(/900 /)
    expect(context.font).toMatch(/Hiragino|Noto Sans JP|Yu Gothic/)
  })

  it('refuses to treat an empty overlay as a successful custom thumbnail', () => {
    const spec = buildThumbnailOverlaySpec({
      orientation: '16:9',
      hook: '無料公開',
      sourceWidth: 1920,
      sourceHeight: 1080,
    })
    spec.hook = ''
    expect(() => drawThumbnailOverlay(mockContext(), spec)).toThrow(/フック/)
  })
})
