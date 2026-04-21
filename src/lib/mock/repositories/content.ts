import type { Asset, Content, ContentStatus, ContentType } from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'
import { createId, nowIso, normalizeTags, withContentRelations } from './helpers'

interface CreateAssetInput {
  name: string
  size: number
  type: Asset['type']
  url?: string
}

interface CreateContentInput {
  workspaceId: string
  authorId: string
  title: string
  body: string
  type: ContentType
  status: ContentStatus
  tags: string[] | string
  assets?: CreateAssetInput[]
}

export function listWorkspaceContent(state: MockAppDataState, workspaceId: string): Content[] {
  return state.contents
    .filter((content) => content.workspaceId === workspaceId)
    .map((content) => withContentRelations(content, state.users))
}

export function getContentById(
  state: MockAppDataState,
  workspaceId: string,
  contentId: string,
): Content | null {
  const content = state.contents.find(
    (entry) => entry.workspaceId === workspaceId && entry.id === contentId,
  )

  return content ? withContentRelations(content, state.users) : null
}

export function listContentAssets(state: MockAppDataState, workspaceId: string, contentId: string): Asset[] {
  return state.assets.filter(
    (asset) => asset.workspaceId === workspaceId && asset.contentId === contentId,
  )
}

export function createContent(
  state: MockAppDataState,
  input: CreateContentInput,
): { state: MockAppDataState; content: Content; assets: Asset[] } {
  const timestamp = nowIso()
  const content: Content = {
    id: createId('cnt'),
    workspaceId: input.workspaceId,
    authorId: input.authorId,
    title: input.title.trim(),
    body: input.body.trim(),
    type: input.type,
    status: input.status,
    tags: normalizeTags(input.tags),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const assets = (input.assets ?? []).map((asset) => ({
    id: createId('ast'),
    workspaceId: input.workspaceId,
    contentId: content.id,
    name: asset.name,
    size: asset.size,
    type: asset.type,
    url: asset.url ?? '',
    uploadedBy: input.authorId,
    createdAt: timestamp,
  }))

  return {
    state: {
      ...state,
      contents: [content, ...state.contents],
      assets: [...assets, ...state.assets],
    },
    content: withContentRelations(content, state.users),
    assets,
  }
}

export function updateContent(
  state: MockAppDataState,
  workspaceId: string,
  contentId: string,
  patch: Partial<Pick<Content, 'title' | 'body' | 'status' | 'tags'>>,
): { state: MockAppDataState; content: Content; previous: Content } {
  const content = state.contents.find(
    (entry) => entry.workspaceId === workspaceId && entry.id === contentId,
  )
  if (!content) {
    throw new Error('Content not found.')
  }

  const nextContent: Content = {
    ...content,
    ...(patch.title ? { title: patch.title.trim() } : {}),
    ...(patch.body !== undefined ? { body: patch.body.trim() } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.tags ? { tags: normalizeTags(patch.tags) } : {}),
    updatedAt: nowIso(),
  }

  return {
    state: {
      ...state,
      contents: state.contents.map((entry) => (entry.id === contentId ? nextContent : entry)),
    },
    content: withContentRelations(nextContent, state.users),
    previous: content,
  }
}
