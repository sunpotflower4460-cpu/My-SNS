import { describe, expect, it } from 'vitest'
import { centerCropForAspect } from './crop'

describe('centerCropForAspect', () => {
  it('crops a landscape frame down to 9:16 without stretching', () => {
    const crop = centerCropForAspect(1920, 1080, 9 / 16)
    expect(crop.sw / crop.sh).toBeCloseTo(9 / 16, 5)
    expect(crop.sh).toBe(1080)
    expect(crop.sx).toBeGreaterThan(0)
  })

  it('crops a portrait frame down to 16:9 without stretching', () => {
    const crop = centerCropForAspect(1080, 1920, 16 / 9)
    expect(crop.sw / crop.sh).toBeCloseTo(16 / 9, 5)
    expect(crop.sw).toBe(1080)
    expect(crop.sy).toBeGreaterThan(0)
  })
})
