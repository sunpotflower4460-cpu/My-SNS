import type { AuditLog, AuditAction } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export async function listWorkspaceAuditLogs(
  workspaceId: string,
  limit: number = 20
): Promise<AuditLog[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      *,
      actor:profiles(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching audit logs:', error)
    return []
  }

  return (data || []).map((log) => {
    const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor
    return {
      id: log.id,
      workspaceId: log.workspace_id,
      actorId: log.actor_id,
      action: log.action as AuditAction,
      targetType: log.target_type,
      targetId: log.target_id,
      metadata: log.metadata,
      createdAt: log.created_at,
      actor: actor ? {
        id: actor.id,
        email: actor.email,
        name: actor.name,
        avatarUrl: actor.avatar_url,
        createdAt: actor.created_at,
      } : undefined,
    }
  })
}

export async function listTargetAuditLogs(
  workspaceId: string,
  targetId: string,
  limit: number = 10
): Promise<AuditLog[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      *,
      actor:profiles(*)
    `)
    .eq('workspace_id', workspaceId)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching target audit logs:', error)
    return []
  }

  return (data || []).map((log) => {
    const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor
    return {
      id: log.id,
      workspaceId: log.workspace_id,
      actorId: log.actor_id,
      action: log.action as AuditAction,
      targetType: log.target_type,
      targetId: log.target_id,
      metadata: log.metadata,
      createdAt: log.created_at,
      actor: actor ? {
        id: actor.id,
        email: actor.email,
        name: actor.name,
        avatarUrl: actor.avatar_url,
        createdAt: actor.created_at,
      } : undefined,
    }
  })
}

export async function appendAuditLog(params: {
  workspaceId: string
  actorId: string
  action: AuditAction
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}): Promise<AuditLog> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      workspace_id: params.workspaceId,
      actor_id: params.actorId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      metadata: params.metadata,
    })
    .select(`
      *,
      actor:profiles(*)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const actor = Array.isArray(data.actor) ? data.actor[0] : data.actor

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    actorId: data.actor_id,
    action: data.action as AuditAction,
    targetType: data.target_type,
    targetId: data.target_id,
    metadata: data.metadata,
    createdAt: data.created_at,
    actor: actor ? {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      avatarUrl: actor.avatar_url,
      createdAt: actor.created_at,
    } : undefined,
  }
}
