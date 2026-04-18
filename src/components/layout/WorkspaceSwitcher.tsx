'use client'

import { useState } from 'react'
import type { Workspace } from '@/lib/domain/types'
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace'

interface WorkspaceSwitcherProps {
  workspace: Workspace
}

export default function WorkspaceSwitcher({ workspace }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const { workspaces, currentMember, setActiveWorkspaceId } = useCurrentWorkspace()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-600 text-xs font-bold text-white">
          {workspace.name.charAt(0)}
        </div>
        <span className="max-w-32 truncate sm:max-w-none">{workspace.name}</span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-3xl border border-stone-200 bg-white p-2 shadow-xl shadow-stone-200/70">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
            Workspaces
          </div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setActiveWorkspaceId(ws.id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                ws.id === workspace.id ? 'text-violet-700 font-medium' : 'text-gray-700'
              }`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-xs font-bold text-violet-700">
                {ws.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate">{ws.name}</p>
                <p className="text-xs text-gray-400">
                  {currentMember?.workspaceId === ws.id ? currentMember.role : 'workspace member'}
                </p>
              </div>
              {ws.id === workspace.id && <span className="ml-auto text-violet-500">✓</span>}
            </button>
          ))}
          <div className="mt-2 border-t border-stone-100 pt-2">
            <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-gray-500 transition hover:bg-stone-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-dashed border-stone-300 text-xs text-gray-400">+</span>
              <span>Create workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
