import { describe, expect, it } from 'vitest'
import { derivePublishMode, isManualCopyChannel } from './config'

describe('derivePublishMode', () => {
  it('keeps note strictly manual, never auto', () => {
    expect(derivePublishMode('note')).toBe('manual')
    expect(isManualCopyChannel('note')).toBe(true)
  })

  it('treats the creator-owned website as owned, not auto', () => {
    expect(derivePublishMode('website')).toBe('owned')
  })

  it('matches the per-channel MVP strategy in docs/master-plan.md §3', () => {
    // X and Instagram: auto once a real connector lands (PR4).
    expect(derivePublishMode('x')).toBe('auto')
    expect(derivePublishMode('instagram')).toBe('auto')
    // YouTube and TikTok intentionally start below auto — quota/upload
    // review and inbox-draft handoff respectively — not simply "api-later = auto".
    expect(derivePublishMode('youtube')).toBe('assisted')
    expect(derivePublishMode('tiktok')).toBe('draft')
  })

  it('defaults channels outside the 5 core MVP channels to a human review gate, not auto', () => {
    expect(derivePublishMode('threads')).toBe('assisted')
    expect(derivePublishMode('facebook')).toBe('assisted')
  })
})
