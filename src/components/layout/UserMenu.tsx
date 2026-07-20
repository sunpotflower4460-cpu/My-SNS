'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace'
import RoleBadge from '@/components/ui/RoleBadge'

// The avatar → dropdown that holds the user's name/email/role and ログアウト —
// moved out of the TopBar's always-visible row (§5.1) so the bar stays calm.
// Closes on outside-click and Escape.

export default function UserMenu() {
  const router = useRouter()
  const { currentUser, signOut } = useCurrentUser()
  const { currentMember } = useCurrentWorkspace()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSignOut = () => {
    signOut()
    router.replace('/login')
  }

  const initial = currentUser?.name?.charAt(0) ?? 'U'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="アカウントメニュー"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700 transition hover:bg-violet-200"
      >
        {initial}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-card border border-stone-200 bg-white py-1 shadow-lg">
          <div className="border-b border-stone-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-900">{currentUser?.name}</p>
            <p className="truncate text-xs text-gray-500">{currentUser?.email ?? 'メールアドレス未登録'}</p>
            <div className="mt-2">
              <RoleBadge role={currentMember?.role ?? 'viewer'} />
            </div>
          </div>
          <button
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-stone-50"
          >
            <LogOut aria-hidden className="h-4 w-4 text-gray-400" />
            ログアウト
          </button>
        </div>
      )}
    </div>
  )
}
