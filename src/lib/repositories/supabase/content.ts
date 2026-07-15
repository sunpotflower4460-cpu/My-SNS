import type { Content, ContentStatus, ContentType, Asset } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface AssetRow {
  id: string
  workspace_id: string
  content_id?: string
  name: string
  url: string
  storage_path?: string | null
  type: Asset['type']
  size: number
  uploaded_by: string
  created_at: string
}

async function resolveAssetUrls(rows: AssetRow[]): Promise<Asset[]> {
  const storagePaths = rows.flatMap((row) => row.storage_path ? [row.storage_path] : [])
  const signedUrlByPath = new Map<string, string>()

  if (storagePaths.length > 0) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('assets').createSignedUrls(storagePaths, 60 * 60)

    if (error) {
      console.error('Error creating signed asset URLs:', error)
    } else {
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) signedUrlByPath.set(entry.path, entry.signedUrl)
      }
    }
  }

  return rows.map((asset) => ({
    id: asset.id,
    workspaceId: asset.workspace_id,
    contentId: asset.content_id,
    name: asset.name,
    url: asset.storage_path ? signedUrlByPath.get(asset.storage_path) ?? '' : asset.url,
    storagePath: asset.storage_path ?? undefined,
    type: asset.type,
    size: asset.size,
    uploadedBy: asset.uploaded_by,
    createdAt: asset.created_at,
  }))
}

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

  return resolveAssetUrls((data || []) as AssetRow[])
}

export async function listWorkspaceAssets(workspaceId: string): Promise<Asset[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching workspace assets:', error)
    return []
  }

  return resolveAssetUrls((data || []) as AssetRow[])
}
