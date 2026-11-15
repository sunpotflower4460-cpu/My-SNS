import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { CORE_PUBLISHING_CHANNELS } from '@/lib/domain/types'
import { isMuseUuid } from './links'

export const MUSE_TITLE_MAX = 120
export const MUSE_TEXT_MAX = 10_000
export const MUSE_GOAL_MAX = 500
export const MUSE_REQUEST_MAX_BYTES = 64 * 1024
export const MUSE_KEY_DAYS = 90

const MUSE_KEY = /^Bearer (mysns_muse_[A-Za-z0-9_-]{43})$/i

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function createMuseKey() {
  const key = `mysns_muse_${randomBytes(32).toString('base64url')}`
  return { key, hash: sha256(key), expiresAt: new Date(Date.now() + MUSE_KEY_DAYS * 86_400_000).toISOString() }
}

export function museKeyHash(request: Request): string | null {
  const key = request.headers.get('authorization')?.match(MUSE_KEY)?.[1]
  return key ? sha256(key) : null
}

type CoreChannel = (typeof CORE_PUBLISHING_CHANNELS)[number]

function readText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const text = value.trim()
  return text && Array.from(text).length <= limit ? text : null
}

export function parseMuseCapture(value: unknown) {
  if (typeof value !== 'object' || !value || Array.isArray(value)) return null
  const { requestId, title, sourceText, goal, targetChannels, ...unknown } = value as Record<string, unknown>
  if (Object.keys(unknown).length || !isMuseUuid(requestId)) return null
  const cleanTitle = readText(title, MUSE_TITLE_MAX)
  const cleanText = readText(sourceText, MUSE_TEXT_MAX)
  const cleanGoal = goal === undefined ? null : readText(goal, MUSE_GOAL_MAX)
  if (!cleanTitle || !cleanText || (goal !== undefined && !cleanGoal)) return null

  // Stable default and ordering so a retry with the same channels in a different
  // order yields the same content hash and doesn't create another Seed.
  let channels: CoreChannel[] = [...CORE_PUBLISHING_CHANNELS]
  if (targetChannels !== undefined) {
    if (!Array.isArray(targetChannels) || !targetChannels.length || targetChannels.length > channels.length
      || targetChannels.some((channel) => !channels.includes(channel))) return null
    channels = channels.filter((channel) => targetChannels.includes(channel))
    if (channels.length !== targetChannels.length) return null
  }

  return { requestId: requestId.toLowerCase(), title: cleanTitle, sourceText: cleanText, goal: cleanGoal, targetChannels: channels }
}

export function museJson(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
}

export function invalidMuseKey() {
  return museJson(
    { code: 'INVALID_KEY', error: 'My-SNS の Muse 連携で、有効な接続キーを登録してください。' },
    401,
    { 'WWW-Authenticate': 'Bearer realm="My-SNS Muse"' },
  )
}

export function museUnavailable() {
  return museJson({ code: 'UNAVAILABLE', error: 'Muse 連携にアクセスできません。少し待ってから再試行してください。' }, 503)
}
