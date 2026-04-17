import type {
  Asset,
  AssetType,
  AuditLog,
  Content,
  InboxItem,
  SocialDraft,
  User,
  WorkspaceMember,
} from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'

export const MOCK_APP_STORAGE_KEY = 'creator-hub.mock-app.v1'
export const MOCK_SESSION_STORAGE_KEY = 'creator-hub.mock-session.v1'

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function normalizeTags(input: string | string[]): string[] {
  const values = Array.isArray(input) ? input : input.split(',')
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

export function inferAssetType(name: string, mimeType?: string): AssetType {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'

  const ext = name.split('.').pop()?.toLowerCase()
  if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (ext && ['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video'
  if (ext && ['mp3', 'wav', 'aac', 'm4a'].includes(ext)) return 'audio'
  return 'document'
}

export function withContentRelations(content: Content, users: User[]): Content {
  return {
    ...content,
    author: users.find((user) => user.id === content.authorId),
  }
}

export function withMemberRelations(member: WorkspaceMember, users: User[]): WorkspaceMember {
  return {
    ...member,
    user: users.find((user) => user.id === member.userId),
  }
}

export function withAuditRelations(log: AuditLog, users: User[]): AuditLog {
  return {
    ...log,
    actor: users.find((user) => user.id === log.actorId),
  }
}

export function sortByNewest<T extends { createdAt?: string; updatedAt?: string; receivedAt?: string }>(items: T[]): T[] {
  return items
    .map((item) => ({
      item,
      timestamp: Date.parse(
        item.updatedAt ?? item.receivedAt ?? item.createdAt ?? '1970-01-01T00:00:00.000Z',
      ),
    }))
    .sort((left, right) => right.timestamp - left.timestamp)
    .map(({ item }) => item)
}

export function getUserById(state: MockAppDataState, userId: string | null | undefined) {
  return state.users.find((user) => user.id === userId) ?? null
}

export function getInboxItemById(state: MockAppDataState, inboxItemId: string): InboxItem | null {
  return state.inboxItems.find((item) => item.id === inboxItemId) ?? null
}

export function getAssetPreview(asset: Asset): string | null {
  if (asset.type === 'image' && asset.url) return asset.url
  return null
}

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}
