'use client'

import { useMemo, useState } from 'react'
import type { Workspace } from '@/lib/domain/types'
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace'
import RoleBadge, { ROLE_LABELS } from '@/components/ui/RoleBadge'

interface WorkspaceSwitcherProps {
  workspace: Workspace
}

export default function WorkspaceSwitcher({ workspace }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const { workspaces, currentMember, workspaceMemberships, setActiveWorkspaceId } = useCurrentWorkspace()
  const membershipsByWorkspaceId = useMemo(
    () =>
      Object.fromEntries(
        workspaceMemberships.map((membership) => [membership.workspaceId, membership.role]),
      ),
    [workspaceMemberships],
  )

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
            <p className="text-xs font-medium tracking-[0.15em] text-gray-400">ワークスペース一覧</p>
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
                <RoleBadge role={membershipsByWorkspaceId[ws.id] ?? 'viewer'} />
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
