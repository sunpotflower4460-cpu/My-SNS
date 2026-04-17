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
  return [...items].sort((left, right) => {
    const leftDate = left.updatedAt ?? left.receivedAt ?? left.createdAt ?? '1970-01-01T00:00:00.000Z'
    const rightDate = right.updatedAt ?? right.receivedAt ?? right.createdAt ?? '1970-01-01T00:00:00.000Z'
    return new Date(rightDate).getTime() - new Date(leftDate).getTime()
  })
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

export function createDraftVariation(text: string, seed: number): string {
  const suffixes = [
    'Fresh angle: lead with the mood before the details.',
    'Variation: make the call-to-action a little warmer.',
    'Alternate take: spotlight the audience invitation first.',
    'New spin: keep the energy calm but a touch more urgent.',
  ]

  return `${text}\n\n${suffixes[seed % suffixes.length]}`
}
