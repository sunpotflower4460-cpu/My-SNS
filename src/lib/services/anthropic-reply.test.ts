import { describe, expect, it } from 'vitest'
import type { BrandProfile } from '@/lib/domain/types'
import { buildReplyGenerationPrompt, parseReplyProposal } from './anthropic-reply'

const brandProfile: BrandProfile = {
  id: 'brand-1',
  workspaceId: 'workspace-1',
  name: 'そら 標準ブランド',
  description: '静かで温かいローファイポップ',
  audience: '既存のファン',
  voiceTraits: ['落ち着いている'],
  values: ['誠実さ'],
  preferredTerms: ['制作'],
  avoidedTerms: ['保証します'],
  defaultCallToAction: '配信リンクはプロフィールから',
  language: 'ja',
  isDefault: true,
  createdBy: 'sora',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

describe('parseReplyProposal', () => {
  it('maps a valid tool response into a ReplyProposal', () => {
    const proposal = parseReplyProposal({
      summary: '次のライブについて質問しています。',
      reply: '7月20日の下北沢公演です。ぜひお越しください。',
      tone: '丁寧',
      assumptions: ['具体的な会場を尋ねていると推測しました'],
      priority: 'high',
    })

    expect(proposal.summary).toContain('ライブ')
    expect(proposal.reply).toContain('下北沢')
    expect(proposal.tone).toBe('丁寧')
    expect(proposal.assumptions).toEqual(['具体的な会場を尋ねていると推測しました'])
    expect(proposal.priority).toBe('high')
  })

  it('throws when the reply is empty rather than accepting a blank send', () => {
    expect(() => parseReplyProposal({ summary: 's', reply: '   ', tone: 'calm', assumptions: [], priority: 'normal' })).toThrow(/empty reply/)
  })

  it('throws when the summary is empty', () => {
    expect(() => parseReplyProposal({ summary: '', reply: 'ok', tone: 'calm', assumptions: [], priority: 'normal' })).toThrow(/empty summary/)
  })

  it('throws when the tool input is not an object at all', () => {
    expect(() => parseReplyProposal('nope')).toThrow(/valid reply proposal/)
  })

  it('falls back to normal priority when the model returns an unknown priority', () => {
    const proposal = parseReplyProposal({ summary: 's', reply: 'r', tone: 'calm', assumptions: [], priority: 'urgent' })
    expect(proposal.priority).toBe('normal')
  })

  it('defaults assumptions to an empty array when the model omits them', () => {
    const proposal = parseReplyProposal({ summary: 's', reply: 'r', tone: 'calm', priority: 'low' })
    expect(proposal.assumptions).toEqual([])
  })
})

describe('buildReplyGenerationPrompt', () => {
  it('includes the inbound message and the Brand Profile constraints', () => {
    const { system, user } = buildReplyGenerationPrompt('次のライブはいつですか？', { brandProfile })
    expect(user).toContain('次のライブはいつですか？')
    expect(user).toContain('保証します') // avoided term surfaced as a constraint
    expect(system).toContain('proposer, never the agent')
  })

  it('omits the style-examples block when none are given', () => {
    const { user } = buildReplyGenerationPrompt('hi', { brandProfile })
    expect(user).not.toContain('Past edits')
  })

  it('includes past-edit examples as a distinct block when provided', () => {
    const { user } = buildReplyGenerationPrompt('hi', {
      brandProfile,
      styleExamples: [{ inbound: 'ありがとう', aiProposed: 'どういたしまして！', humanApproved: 'こちらこそありがとうございます。' }],
    })
    expect(user).toContain('Past edits this creator made')
    expect(user).toContain('こちらこそありがとうございます。')
  })

  it('surfaces the creator status (mood + note) only when provided', () => {
    const without = buildReplyGenerationPrompt('hi', { brandProfile })
    expect(without.user).not.toContain("Creator's current status")

    const withStatus = buildReplyGenerationPrompt('hi', {
      brandProfile,
      creatorStatus: { mood: '忙しい', note: '今週は制作に集中しています' },
    })
    expect(withStatus.user).toContain("Creator's current status")
    expect(withStatus.user).toContain('忙しい')
    expect(withStatus.user).toContain('今週は制作に集中しています')
    // The guardrail to only share when it helps lives in the system prompt.
    expect(withStatus.system).toContain('ONLY when it genuinely helps')
  })
})
