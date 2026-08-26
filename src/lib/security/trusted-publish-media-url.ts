// Server-side publishing must never fetch an arbitrary URL supplied through
// draft/Revision metadata. The app owns media in its Supabase Storage `assets`
// bucket and publish-worker generates short-lived signed URLs from storage_path.
// Keep this check close to connectors too: defense in depth protects a future
// caller that accidentally bypasses publish-worker's normal media resolution.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function assertTrustedPublishMediaUrl(rawUrl: string): URL {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured, so publish media origin cannot be verified.')
  }

  let media: URL
  let expected: URL
  try {
    media = new URL(rawUrl)
    expected = new URL(supabaseUrl)
  } catch {
    throw new Error('Publish media URL is invalid.')
  }

  if (media.origin !== expected.origin) {
    throw new Error('Publish media URL must come from this workspace Supabase Storage project.')
  }

  const secureProtocol = media.protocol === 'https:'
  const trustedLocalDevelopment =
    media.protocol === 'http:'
    && expected.protocol === 'http:'
    && LOOPBACK_HOSTS.has(expected.hostname)

  if (!secureProtocol && !trustedLocalDevelopment) {
    throw new Error('Publish media URL must use HTTPS outside local loopback development.')
  }

  const allowedPathPrefixes = [
    '/storage/v1/object/sign/assets/',
    '/storage/v1/object/public/assets/',
    '/storage/v1/object/authenticated/assets/',
  ]
  if (!allowedPathPrefixes.some((prefix) => media.pathname.startsWith(prefix))) {
    throw new Error('Publish media URL is not an assets-bucket Storage URL.')
  }

  // Storage object requests never need credentials embedded in the URL itself.
  // Reject userinfo so a crafted URL cannot smuggle confusing authority text.
  if (media.username || media.password) {
    throw new Error('Publish media URL must not contain URL credentials.')
  }

  return media
}
