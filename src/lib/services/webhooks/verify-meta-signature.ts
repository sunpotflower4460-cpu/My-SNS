import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the *raw*
 * request body, keyed by the app secret. Must run against the raw body
 * text, not a re-serialized JSON.parse(...) round trip — Meta signs the
 * exact bytes it sent, and re-serializing can produce different bytes (key
 * order, whitespace) that would make a genuine request look invalid.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const provided = signatureHeader.slice('sha256='.length)

  const expectedBuffer = Buffer.from(expected, 'hex')
  const providedBuffer = Buffer.from(provided, 'hex')
  if (expectedBuffer.length !== providedBuffer.length) return false

  return timingSafeEqual(expectedBuffer, providedBuffer)
}
