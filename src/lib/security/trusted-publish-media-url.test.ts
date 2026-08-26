import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertTrustedPublishMediaUrl } from './trusted-publish-media-url'

describe('assertTrustedPublishMediaUrl', () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous
  })

  it('accepts a signed URL from the assets bucket in the configured Supabase project', () => {
    const url = assertTrustedPublishMediaUrl(
      'https://project.supabase.co/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
    )

    expect(url.origin).toBe('https://project.supabase.co')
    expect(url.pathname).toBe('/storage/v1/object/sign/assets/workspace/video.mp4')
  })

  it('accepts HTTP only when the configured Supabase origin itself is local loopback', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    const url = assertTrustedPublishMediaUrl(
      'http://127.0.0.1:54321/storage/v1/object/sign/assets/workspace/video.mp4?token=abc',
    )

    expect(url.origin).toBe('http://127.0.0.1:54321')
  })

  it('rejects another origin even when its path looks like Supabase Storage', () => {
    expect(() =>
      assertTrustedPublishMediaUrl('https://attacker.example/storage/v1/object/sign/assets/video.mp4?token=x'),
    ).toThrow(/Supabase Storage project/)
  })

  it('rejects non-assets paths on the right origin', () => {
    expect(() => assertTrustedPublishMediaUrl('https://project.supabase.co/rest/v1/secrets')).toThrow(/assets-bucket/)
  })

  it('rejects plain HTTP for a non-loopback configured project', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://project.supabase.co'
    expect(() => assertTrustedPublishMediaUrl('http://project.supabase.co/storage/v1/object/sign/assets/video.mp4')).toThrow(/HTTPS/)
  })
})
