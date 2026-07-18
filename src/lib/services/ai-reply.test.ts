import { describe, expect, it } from 'vitest'
import type { BrandProfile } from '@/lib/domain/types'
import { TemplateReplyGeneratorService } from './ai-reply'

const service = new TemplateReplyGeneratorService()

describe('TemplateReplyGeneratorService', () => {
  it('makes no assumptions and returns a neutral acknowledgment', async () => {
    const proposal = await service.generateReply('この曲すごく良いです！')
    expect(proposal.assumptions).toEqual([])
    expect(proposal.priority).toBe('normal')
    expect(proposal.reply).toContain('メッセージありがとうございます')
    expect(proposal.summary).toContain('この曲')
  })

  it('appends the Brand Profile default CTA when present', async () => {
    const brandProfile = { defaultCallToAction: '配信リンクはプロフィールから' } as BrandProfile
    const proposal = await service.generateReply('hi', { brandProfile })
    expect(proposal.reply).toContain('配信リンクはプロフィールから')
  })

  it('truncates a long inbound message in the summary', async () => {
    const long = 'あ'.repeat(200)
    const proposal = await service.generateReply(long)
    expect(proposal.summary.length).toBeLessThanOrEqual(81)
    expect(proposal.summary.endsWith('…')).toBe(true)
  })
})
