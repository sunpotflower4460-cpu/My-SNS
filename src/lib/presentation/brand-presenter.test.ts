import { describe, expect, it } from 'vitest'
import { normalizeBrandList, validateBrandProfile } from './brand-presenter'

describe('normalizeBrandList', () => {
  it('splits on newlines and commas, trims, and drops empties', () => {
    expect(normalizeBrandList('温かい, 正直\n落ち着いている')).toEqual(['温かい', '正直', '落ち着いている'])
  })

  it('de-duplicates', () => {
    expect(normalizeBrandList('誠実\n誠実\n, 誠実')).toEqual(['誠実'])
  })

  it('returns an empty array for blank input', () => {
    expect(normalizeBrandList('  \n , ')).toEqual([])
  })
})

describe('validateBrandProfile', () => {
  it('requires a name', () => {
    expect(validateBrandProfile({ name: '  ', language: 'ja' })).toEqual({ ok: false, error: expect.stringContaining('プロフィール名') })
  })

  it('requires a language', () => {
    expect(validateBrandProfile({ name: 'そら', language: '' })).toEqual({ ok: false, error: expect.stringContaining('言語') })
  })

  it('passes when both are present', () => {
    expect(validateBrandProfile({ name: 'そら', language: 'ja' })).toEqual({ ok: true })
  })
})
