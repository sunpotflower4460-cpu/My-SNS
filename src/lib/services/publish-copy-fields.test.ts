import { describe, expect, it } from 'vitest'
import { buildPublishCopyFields } from './publish-copy-fields'

const revision = {
  title: 'My title',
  body: 'Main body',
  cta: 'Read more',
  hashtags: ['#one', 'two'],
}

describe('buildPublishCopyFields', () => {
  it('splits YouTube title and description', () => {
    expect(buildPublishCopyFields(revision, 'youtube')).toEqual([
      { id: 'title', label: 'タイトル', value: 'My title' },
      { id: 'body', label: '説明文', value: 'Main body\n\nRead more\n\n#one #two' },
    ])
  })

  it('splits note title and body', () => {
    expect(buildPublishCopyFields(revision, 'note')).toEqual([
      { id: 'title', label: 'タイトル', value: 'My title' },
      { id: 'body', label: '本文', value: 'Main body\n\nRead more\n\n#one #two' },
    ])
  })

  it('uses a single caption for Instagram', () => {
    expect(buildPublishCopyFields(revision, 'instagram')).toEqual([
      { id: 'combined', label: 'キャプション', value: 'Main body\n\nRead more\n\n#one #two' },
    ])
  })
})
