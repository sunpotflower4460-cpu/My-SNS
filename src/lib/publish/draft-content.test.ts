import { describe, expect, it } from 'vitest'
import { hasDraftContentChanged } from './draft-content'

const saved = { draftText: 'body', title: 'T', cta: 'go', hashtags: ['a', 'b'] }

describe('hasDraftContentChanged', () => {
  it('is false for identical words, treating missing and empty title/cta alike', () => {
    expect(hasDraftContentChanged(saved, { ...saved })).toBe(false)
    expect(hasDraftContentChanged({ ...saved, title: undefined, cta: undefined }, { ...saved, title: '', cta: '' })).toBe(false)
  })

  it('is true when the text, title, cta or hashtags change', () => {
    expect(hasDraftContentChanged(saved, { ...saved, draftText: 'body!' })).toBe(true)
    expect(hasDraftContentChanged(saved, { ...saved, title: 'U' })).toBe(true)
    expect(hasDraftContentChanged(saved, { ...saved, cta: 'buy' })).toBe(true)
    expect(hasDraftContentChanged(saved, { ...saved, hashtags: ['a'] })).toBe(true)
  })
})
