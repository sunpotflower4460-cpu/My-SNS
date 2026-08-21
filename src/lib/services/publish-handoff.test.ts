import { describe, expect, it } from 'vitest'
import { buildPublishHandoff, formatRevisionForHandoff } from './publish-handoff'

const revision = {
  title: '新しい曲のお知らせ',
  body: '今日から配信です。',
  cta: '聴いてみてください。',
  hashtags: ['music', '#newrelease'],
}

describe('formatRevisionForHandoff', () => {
  it('formats X without a duplicated title and normalizes hashtags', () => {
    expect(formatRevisionForHandoff(revision, 'x')).toBe(
      '今日から配信です。\n\n聴いてみてください。\n\n#music #newrelease',
    )
  })

  it('keeps a YouTube title above the description', () => {
    expect(formatRevisionForHandoff(revision, 'youtube')).toBe(
      '新しい曲のお知らせ\n\n今日から配信です。\n\n聴いてみてください。\n\n#music #newrelease',
    )
  })

  it('formats note as paste-ready Markdown', () => {
    expect(formatRevisionForHandoff(revision, 'note')).toBe(
      '# 新しい曲のお知らせ\n\n今日から配信です。\n\n聴いてみてください。\n\n#music #newrelease',
    )
  })
})

describe('buildPublishHandoff', () => {
  it('uses the official X Web Intent with prefilled text', () => {
    const target = buildPublishHandoff('x', 'hello world')
    expect(target?.prefilledText).toBe(true)
    expect(target?.url).toBe('https://x.com/intent/tweet?text=hello%20world')
  })

  it('uses platform-owned pages for manual handoff channels', () => {
    expect(buildPublishHandoff('instagram', 'x')?.url).toBe('https://www.instagram.com/')
    expect(buildPublishHandoff('youtube', 'x')?.url).toBe('https://studio.youtube.com/')
    expect(buildPublishHandoff('tiktok', 'x')?.url).toBe('https://www.tiktok.com/upload')
    expect(buildPublishHandoff('note', 'x')?.url).toBe('https://note.com/notes/new')
  })

  it('does not pretend an owned website has an SNS handoff', () => {
    expect(buildPublishHandoff('website', 'x')).toBeNull()
  })
})
