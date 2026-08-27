'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Workspace, WorkspaceRole } from '@/lib/domain/types'
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace'
import { useAuth } from '@/lib/auth/auth-provider'
import { createClient } from '@/lib/supabase/client'
import RoleBadge, { ROLE_LABELS } from '@/components/ui/RoleBadge'

interface WorkspaceSwitcherProps {
  workspace: Workspace
}

export default function WorkspaceSwitcher({ workspace }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const { currentUserId } = useAuth()
  const { workspaces, currentMember, workspaceMemberships, setActiveWorkspaceId } = useCurrentWorkspace()
  const fallbackMembershipsByWorkspaceId = useMemo(
    () =>
      Object.fromEntries(
        workspaceMemberships.map((membership) => [membership.workspaceId, membership.role]),
      ) as Record<string, WorkspaceRole>,
    [workspaceMemberships],
  )
  const [rolesByWorkspaceId, setRolesByWorkspaceId] = useState<Record<string, WorkspaceRole>>(fallbackMembershipsByWorkspaceId)

  useEffect(() => {
    setRolesByWorkspaceId(fallbackMembershipsByWorkspaceId)
  }, [fallbackMembershipsByWorkspaceId])

  // AppProvider's `members` collection is intentionally scoped to the active
  // workspace, so deriving every switcher role from it makes all non-active
  // workspaces look like `viewer`. Query this user's own memberships across the
  // visible workspace ids instead; this is display-only and still RLS-scoped.
  useEffect(() => {
    if (!currentUserId || workspaces.length === 0) return

    let cancelled = false
    const supabase = createClient()
    const workspaceIds = workspaces.map((item) => item.id)

    void supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', currentUserId)
      .in('workspace_id', workspaceIds)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load workspace roles for switcher:', error)
          return
        }
        if (!data) return
        const next = Object.fromEntries(
          data.map((membership) => [membership.workspace_id, membership.role as WorkspaceRole]),
        ) as Record<string, WorkspaceRole>
        setRolesByWorkspaceId(next)
      })

    return () => {
      cancelled = true
    }
  }, [currentUserId, workspaces])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white">
          {workspace.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{workspace.name}</p>
          <p className="truncate text-xs text-gray-500">
            {workspace.slug} · {ROLE_LABELS[currentMember?.role ?? 'viewer']}
          </p>
        </div>
        <span className="text-xs text-gray-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-3xl border border-stone-200 bg-white p-2 shadow-xl shadow-stone-200/70">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-gray-400">ワークスペース一覧</p>
            <p className="mt-1 text-xs text-gray-500">
              シード・ブランドプロフィール・受信箱・公開キュー・チームの表示先を切り替えます。
            </p>
          </div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setActiveWorkspaceId(ws.id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                ws.id === workspace.id
                  ? 'border border-violet-200 bg-violet-50 text-violet-800'
                  : 'border border-transparent text-gray-700 hover:border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-xs font-bold text-violet-700">
                {ws.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ws.name}</p>
                <p className="truncate text-xs text-gray-500">{ws.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                {rolesByWorkspaceId[ws.id] ? (
                  <RoleBadge role={rolesByWorkspaceId[ws.id]} />
                ) : (
                  <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] text-gray-400">役割不明</span>
                )}
                {ws.id === workspace.id && <span className="text-violet-500">✓</span>}
              </div>
            </button>
          ))}
          <div className="mt-2 border-t border-stone-100 pt-2">
            <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-gray-500 transition hover:bg-stone-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-dashed border-stone-300 text-xs text-gray-400">+</span>
              <span>
                ワークスペースを作成 <span className="text-gray-400">(今後のアップデートで対応予定)</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
