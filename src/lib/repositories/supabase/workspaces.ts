import type {
  Workspace,
  WorkspaceMember,
  Invitation,
  SocialAccount,
  WorkspaceRole,
} from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export async function getUserWorkspaces(userId: string): Promise<Workspace[]> {
  const supabase = createClient()

  // First get the workspace IDs for this user
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)

  if (!memberships || memberships.length === 0) {
    return []
  }

  const workspaceIds = memberships.map(m => m.workspace_id)

  // Then get the workspaces
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .in('id', workspaceIds)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching workspaces:', error)
    return []
  }

  return (data || []).map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    logoUrl: w.logo_url,
    ownerId: w.owner_id,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }))
}

export async function getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single()

  if (error || !data) {
    console.error('Error fetching workspace:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    logoUrl: data.logo_url,
    ownerId: data.owner_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function getCurrentMember(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMember | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      *,
      user:profiles(*)
    `)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  const user = Array.isArray(data.user) ? data.user[0] : data.user

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    role: data.role,
    joinedAt: data.joined_at,
    user: user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    } : undefined,
  }
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      *,
      user:profiles(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('joined_at', { ascending: true })

  if (error) {
    console.error('Error fetching members:', error)
    return []
  }

  return (data || []).map((m) => {
    const user = Array.isArray(m.user) ? m.user[0] : m.user
    return {
      id: m.id,
      workspaceId: m.workspace_id,
      userId: m.user_id,
      role: m.role,
      joinedAt: m.joined_at,
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      } : undefined,
    }
  })
}

export async function listWorkspaceInvitations(workspaceId: string): Promise<Invitation[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching invitations:', error)
    return []
  }

  return (data || []).map((i) => ({
    id: i.id,
    workspaceId: i.workspace_id,
    email: i.email,
    role: i.role,
    status: i.status,
    invitedBy: i.invited_by,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
  }))
}

export async function inviteWorkspaceMember(params: {
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
}): Promise<Invitation> {
  const supabase = createClient()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase
    .from('workspace_invitations')
    .insert({
      workspace_id: params.workspaceId,
      email: params.email.trim().toLowerCase(),
      role: params.role,
      invited_by: params.invitedBy,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    email: data.email,
    role: data.role,
    status: data.status,
    invitedBy: data.invited_by,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  }
}

export async function updateWorkspaceMemberRole(params: {
  workspaceId: string
  userId: string
  role: WorkspaceRole
}): Promise<WorkspaceMember> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .update({ role: params.role })
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.userId)
    .select(`
      *,
      user:profiles(*)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const user = Array.isArray(data.user) ? data.user[0] : data.user

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    role: data.role,
    joinedAt: data.joined_at,
    user: user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    } : undefined,
  }
}

export async function removeWorkspaceMember(params: {
  workspaceId: string
  userId: string
}): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function updateWorkspaceDetails(params: {
  workspaceId: string
  name: string
  slug: string
}): Promise<Workspace> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspaces')
    .update({
      name: params.name.trim(),
      slug: params.slug.trim().toLowerCase(),
    })
    .eq('id', params.workspaceId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    logoUrl: data.logo_url,
    ownerId: data.owner_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function listWorkspaceSocialAccounts(workspaceId: string): Promise<SocialAccount[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching social accounts:', error)
    return []
  }

  return (data || []).map((a) => ({
    id: a.id,
    workspaceId: a.workspace_id,
    platform: a.platform,
    handle: a.handle,
    connected: a.connected,
    connectedAt: a.connected_at,
  }))
}

export async function createWorkspace(params: {
  name: string
  slug: string
  ownerId: string
}): Promise<Workspace> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name: params.name.trim(),
      slug: params.slug.trim().toLowerCase(),
      owner_id: params.ownerId,
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    logoUrl: data.logo_url,
    ownerId: data.owner_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
