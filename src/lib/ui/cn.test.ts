import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins truthy class strings with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values (conditional classes)', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('preserves order so later (overriding) classes win in the cascade', () => {
    expect(cn('rounded-card', 'rounded-full')).toBe('rounded-card rounded-full')
  })
})
