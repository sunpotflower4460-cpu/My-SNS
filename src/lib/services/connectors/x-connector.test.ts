import { describe, expect, it } from 'vitest'
import type { PublishRequest } from '../interfaces'
import { buildFirstTweetText } from './x-connector'

const baseRequest: PublishRequest = {
  platform: 'x',
  accessToken: 'token',
  body: 'Just shipped a new arrangement.',
  hashtags: [],
  metadata: {},
}

describe('buildFirstTweetText', () => {
  it('includes the body, CTA, and hashtags — the CTA is not silently dropped', () => {
    const text = buildFirstTweetText({
      ...baseRequest,
      cta: 'Listen now: example.com/track',
      hashtags: ['newmusic', 'studio'],
    })

    expect(text).toContain('Just shipped a new arrangement.')
    expect(text).toContain('Listen now: example.com/track')
    expect(text).toContain('#newmusic')
    expect(text).toContain('#studio')
  })

  it('omits the CTA and hashtag suffixes entirely when absent, rather than leaving stray whitespace', () => {
    expect(buildFirstTweetText(baseRequest)).toBe('Just shipped a new arrangement.')
  })
})
