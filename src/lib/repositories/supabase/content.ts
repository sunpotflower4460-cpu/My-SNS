import type { Content, ContentStatus, ContentType, Asset } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export async function listWorkspaceContent(workspaceId: string): Promise<Content[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('contents')
    .select(`
      *,
      author:profiles(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching content:', error)
    return []
  }

  return (data || []).map((c) => {
    const author = Array.isArray(c.author) ? c.author[0] : c.author
    return {
      id: c.id,
      workspaceId: c.workspace_id,
      title: c.title,
      body: c.body,
      type: c.type,
      status: c.status,
      tags: c.tags || [],
      authorId: c.author_id,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      author: author ? {
        id: author.id,
        email: author.email,
        name: author.name,
        avatarUrl: author.avatar_url,
        createdAt: author.created_at,
      } : undefined,
    }
  })
}

export async function getContentById(workspaceId: string, contentId: string): Promise<Content | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('contents')
    .select(`
      *,
      author:profiles(*)
    `)
    .eq('id', contentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    console.error('Error fetching content:', error)
    return null
  }

  const author = Array.isArray(data.author) ? data.author[0] : data.author

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    title: data.title,
    body: data.body,
    type: data.type,
    status: data.status,
    tags: data.tags || [],
    authorId: data.author_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    author: author ? {
      id: author.id,
      email: author.email,
      name: author.name,
      avatarUrl: author.avatar_url,
      createdAt: author.created_at,
    } : undefined,
  }
}

export async function createContent(params: {
  workspaceId: string
  authorId: string
  title: string
  body: string
  type: ContentType
  status: ContentStatus
  tags: string[] | string
}): Promise<Content> {
  const supabase = createClient()

  const tags = typeof params.tags === 'string'
    ? params.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : params.tags

  const { data, error } = await supabase
    .from('contents')
    .insert({
      workspace_id: params.workspaceId,
      author_id: params.authorId,
      title: params.title,
      body: params.body,
      type: params.type,
      status: params.status,
      tags,
    })
    .select(`
      *,
      author:profiles(*)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const author = Array.isArray(data.author) ? data.author[0] : data.author

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    title: data.title,
    body: data.body,
    type: data.type,
    status: data.status,
    tags: data.tags || [],
    authorId: data.author_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    author: author ? {
      id: author.id,
      email: author.email,
      name: author.name,
      avatarUrl: author.avatar_url,
      createdAt: author.created_at,
    } : undefined,
  }
}

export async function updateContent(
  workspaceId: string,
  contentId: string,
  patch: Partial<Pick<Content, 'title' | 'body' | 'status' | 'tags'>>
): Promise<Content> {
  const supabase = createClient()

  const updates: Record<string, unknown> = {}
  if (patch.title !== undefined) updates.title = patch.title
  if (patch.body !== undefined) updates.body = patch.body
  if (patch.status !== undefined) updates.status = patch.status
  if (patch.tags !== undefined) updates.tags = patch.tags

  const { data, error } = await supabase
    .from('contents')
    .update(updates)
    .eq('id', contentId)
    .eq('workspace_id', workspaceId)
    .select(`
      *,
      author:profiles(*)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const author = Array.isArray(data.author) ? data.author[0] : data.author

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    title: data.title,
    body: data.body,
    type: data.type,
    status: data.status,
    tags: data.tags || [],
    authorId: data.author_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    author: author ? {
      id: author.id,
      email: author.email,
      name: author.name,
      avatarUrl: author.avatar_url,
      createdAt: author.created_at,
    } : undefined,
  }
}

export async function listContentAssets(workspaceId: string, contentId: string): Promise<Asset[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('content_id', contentId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching assets:', error)
    return []
  }

  return (data || []).map((a) => ({
    id: a.id,
    workspaceId: a.workspace_id,
    contentId: a.content_id,
    name: a.name,
    url: a.url,
    type: a.type,
    size: a.size,
    uploadedBy: a.uploaded_by,
    createdAt: a.created_at,
  }))
}
