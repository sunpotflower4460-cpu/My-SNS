import { createHash, randomBytes } from 'node:crypto'

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(24))
}

export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32))
}

export function deriveCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest())
}
