import { describe, expect, it } from 'vitest'
import { buildStyleExamples, type ReplyExampleRow } from './reply-learning'

function row(inbound: string | null, aiProposed: string | null, humanApproved: string): ReplyExampleRow {
  return {
    reply_text: humanApproved,
    ai_reply_suggestions: aiProposed === null ? null : { suggested_text: aiProposed, source: 'ai' },
    inbox_items: inbound === null ? null : { text: inbound },
  }
}

describe('buildStyleExamples', () => {
  it('maps valid rows to {inbound, aiProposed, humanApproved} triples', () => {
    const result = buildStyleExamples([row('元気ですか？', 'はい、元気です。', 'おかげさまで元気です！')])
    expect(result).toEqual([
      { inbound: '元気ですか？', aiProposed: 'はい、元気です。', humanApproved: 'おかげさまで元気です！' },
    ])
  })

  it('drops rows missing the inbound text or the AI proposal', () => {
    const result = buildStyleExamples([
      row(null, 'AI案', '承認テキスト'),
      row('こんにちは', null, '承認テキスト'),
      row('  ', 'AI案', '承認テキスト'),
      row('有効な受信', 'AI案', '承認テキスト'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].inbound).toBe('有効な受信')
  })

  it('handles Supabase embedded relations returned as single-element arrays', () => {
    const arrayRow: ReplyExampleRow = {
      reply_text: '送信した返信',
      ai_reply_suggestions: [{ suggested_text: 'AIの提案', source: 'ai' }],
      inbox_items: [{ text: '受信メッセージ' }],
    }
    expect(buildStyleExamples([arrayRow])).toEqual([
      { inbound: '受信メッセージ', aiProposed: 'AIの提案', humanApproved: '送信した返信' },
    ])
  })

  it('prefers human-edited examples over verbatim approvals, then caps at the limit', () => {
    const rows = [
      row('m1', 'same-1', 'same-1'), // verbatim
      row('m2', 'ai-2', 'edited-2'), // edited
      row('m3', 'same-3', 'same-3'), // verbatim
      row('m4', 'ai-4', 'edited-4'), // edited
    ]
    const result = buildStyleExamples(rows, 2)
    expect(result.map((e) => e.humanApproved)).toEqual(['edited-2', 'edited-4'])
  })

  it('falls back to verbatim approvals when there are not enough edited ones', () => {
    const rows = [row('m1', 'same-1', 'same-1'), row('m2', 'ai-2', 'edited-2')]
    const result = buildStyleExamples(rows, 3)
    // edited first, then the verbatim one fills the remaining slot
    expect(result.map((e) => e.humanApproved)).toEqual(['edited-2', 'same-1'])
  })

  it('returns an empty array when nothing is usable', () => {
    expect(buildStyleExamples([row(null, null, 'x')])).toEqual([])
    expect(buildStyleExamples([])).toEqual([])
  })
})
