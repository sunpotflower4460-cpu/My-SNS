import { describe, expect, it } from 'vitest'
import { keepFactualAssumptions } from './draft-assumptions'

describe('keepFactualAssumptions', () => {
  it('keeps guessed facts that were not in the Seed', () => {
    expect(keepFactualAssumptions(['開催日がなかったので来週土曜と仮定した', 'Assumed evening posting time.'])).toEqual([
      '開催日がなかったので来週土曜と仮定した',
      'Assumed evening posting time.',
    ])
  })

  it('drops copy-editing notes so the creator\'s own words are not framed as AI guesses', () => {
    expect(
      keepFactualAssumptions([
        '原文をYouTube向けに整えた',
        '媒体向けに言い換えた',
        'タイトルを添削した',
        'Copy-edited the source text for length.',
      ]),
    ).toEqual([])
  })

  it('drops thumbnail-hook labels even when a factual note is mixed in the same list', () => {
    expect(
      keepFactualAssumptions([
        'サムネイルのフック「今すぐ見る」はAIの提案です。画面で確認してください。',
        'サムネイルのフック「無料公開」はAI提案を3〜8文字に短縮したものです。',
        '価格が書いていなかったので「詳細はプロフィールへ」とした',
      ]),
    ).toEqual(['価格が書いていなかったので「詳細はプロフィールへ」とした'])
  })

  it('drops blank entries', () => {
    expect(keepFactualAssumptions(['  ', '', '会場名が不明なため未記載のままにした'])).toEqual([
      '会場名が不明なため未記載のままにした',
    ])
  })
})
