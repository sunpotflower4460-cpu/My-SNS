import { describe, expect, it } from 'vitest'
import { CORE_PUBLISHING_CHANNELS } from '@/lib/domain/types'
import { derivePublishMode, isManualCopyChannel } from './config'

describe('derivePublishMode', () => {
  it('keeps note strictly manual, never auto', () => {
    expect(derivePublishMode('note')).toBe('manual')
    expect(isManualCopyChannel('note')).toBe(true)
  })

  it('treats the creator-owned website as owned, not auto', () => {
    expect(derivePublishMode('website')).toBe('owned')
  })

  it('defaults every other core channel to auto', () => {
    const autoModeChannels = CORE_PUBLISHING_CHANNELS.filter((channel) => channel !== 'note')
    for (const channel of autoModeChannels) {
      expect(derivePublishMode(channel)).toBe('auto')
    }
  })
})
