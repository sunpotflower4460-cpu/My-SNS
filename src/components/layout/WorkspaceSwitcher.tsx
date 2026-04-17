'use client'

import { useState } from 'react'
import type { Workspace } from '@/lib/domain/types'
import { MOCK_WORKSPACE } from '@/lib/mock/seed'

interface WorkspaceSwitcherProps {
  workspace: Workspace
}

const ALL_WORKSPACES = [MOCK_WORKSPACE]

export default function WorkspaceSwitcher({ workspace }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <div className="w-4 h-4 rounded bg-violet-600 flex items-center justify-center text-white text-xs font-bold">
          {workspace.name.charAt(0)}
        </div>
        <span>{workspace.name}</span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-xs text-gray-400 font-medium uppercase tracking-wide">
            Workspaces
          </div>
          {ALL_WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              onClick={() => setOpen(false)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                ws.id === workspace.id ? 'text-violet-700 font-medium' : 'text-gray-700'
              }`}
            >
              <div className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold">
                {ws.name.charAt(0)}
              </div>
              {ws.name}
              {ws.id === workspace.id && <span className="ml-auto text-violet-500">✓</span>}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 text-left">
              <span className="w-6 h-6 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">+</span>
              Create workspace
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
