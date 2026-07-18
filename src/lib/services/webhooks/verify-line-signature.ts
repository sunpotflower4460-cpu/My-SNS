import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies LINE's X-Line-Signature header: base64(HMAC-SHA256(channelSecret,
 * rawBody)). Must run against the *raw* request body, not a re-serialized
 * JSON.parse round trip — LINE signs the exact bytes it sent, and
 * re-serializing can produce different bytes (key order, whitespace) that
 * would make a genuine request look invalid.
 *
 * (LINE uses base64 with no prefix, unlike Meta's hex `sha256=…`.)
 */
export function verifyLineSignature(rawBody: string, signatureHeader: string | null, channelSecret: string): boolean {
  if (!signatureHeader) return false

  const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest('base64')

  const expectedBuffer = Buffer.from(expected, 'base64')
  const providedBuffer = Buffer.from(signatureHeader, 'base64')
  if (expectedBuffer.length !== providedBuffer.length) return false

  return timingSafeEqual(expectedBuffer, providedBuffer)
}
