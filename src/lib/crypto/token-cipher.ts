import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Server-only. Encrypts OAuth tokens before they ever reach
// social_account_credentials — see that table's RLS comment for why the DB
// layer alone isn't trusted with plaintext tokens.

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function loadKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.')
  }

  // Accept base64 or hex; either must decode to exactly 32 bytes (AES-256).
  const key = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')

  if (key.length !== 32) {
    throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex).')
  }

  return key
}

/** Returns base64(iv || authTag || ciphertext). */
export function encryptToken(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptToken(encrypted: string): string {
  const key = loadKey()
  const raw = Buffer.from(encrypted, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16)
  const ciphertext = raw.subarray(IV_LENGTH + 16)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function isTokenEncryptionConfigured(): boolean {
  try {
    loadKey()
    return true
  } catch {
    return false
  }
}
