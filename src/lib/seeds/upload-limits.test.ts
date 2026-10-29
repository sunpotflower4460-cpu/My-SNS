import { describe, expect, it } from 'vitest'
import { describeTooLarge, getMaxUploadBytes, partitionUploadFiles } from './upload-limits'

const file = (name: string, size: number) => ({ name, size }) as File

describe('upload limits', () => {
  it('defaults to 50 MB and accepts an override, ignoring junk', () => {
    expect(getMaxUploadBytes(undefined)).toBe(50 * 1024 * 1024)
    expect(getMaxUploadBytes('200')).toBe(200 * 1024 * 1024)
    expect(getMaxUploadBytes('abc')).toBe(50 * 1024 * 1024)
    expect(getMaxUploadBytes('-5')).toBe(50 * 1024 * 1024)
  })

  it('splits files at the limit (the limit itself is allowed)', () => {
    const max = 10
    const { accepted, tooLarge } = partitionUploadFiles([file('a', 10), file('b', 11), file('c', 1)], max)
    expect(accepted.map((f) => f.name)).toEqual(['a', 'c'])
    expect(tooLarge.map((f) => f.name)).toEqual(['b'])
  })

  it('explains in Japanese, truncating long lists', () => {
    const message = describeTooLarge([file('one.mp4', 80e6), file('two.mp4', 90e6), file('3.mp4', 1e8), file('4.mp4', 1e8)])
    expect(message).toContain('「one.mp4」')
    expect(message).toContain('ほか1件')
    expect(message).toContain('1ファイル50.0 MBまで')
    expect(describeTooLarge([])).toBe('')
  })
})
