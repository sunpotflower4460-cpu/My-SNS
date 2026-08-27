import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission, type Permission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'

/**
 * Loads the caller's workspace membership. Distinguishes transient DB failures
 * (503) from a true missing membership / insufficient role (403).
 */
export async function requireWorkspaceMember(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  permission: Permission,
  forbiddenMessage = 'この操作を行う権限がありません。',
): Promise<{ role: WorkspaceRole } | NextResponse> {
  const { data: member, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load workspace membership:', error)
    return NextResponse.json(
      { error: 'メンバーシップを確認できないため、安全のため処理を中止しました。少し待ってから再試行してください。' },
      { status: 503 },
    )
  }

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, permission)) {
    return NextResponse.json({ error: forbiddenMessage }, { status: 403 })
  }

  return { role }
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse
}
