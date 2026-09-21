'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useApp } from '@/lib/app/app-provider'
import type { Notification, SocialDraft } from '@/lib/domain/types'

const TARGET_HREF: Record<string, string> = {
  social_draft: '/app/drafts',
  publish_job: '/app/queue',
  inbox_item: '/app/inbox',
}

function targetHref(notification: Notification, drafts: SocialDraft[]): string {
  // A draft notification points at the draft id; the drafts screen is keyed by
  // seed, so resolve it when the draft is still loaded.
  if (notification.targetType === 'social_draft' && notification.targetId) {
    const seedId = drafts.find((draft) => draft.id === notification.targetId)?.seedId
    if (seedId) return `/app/drafts?seed=${seedId}`
  }
  return (notification.targetType && TARGET_HREF[notification.targetType]) ?? '/app/dashboard'
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  return `${Math.round(hours / 24)}日前`
}

export default function NotificationBell() {
  const { drafts, markAllNotificationsRead, markNotificationRead, notifications } = useApp()
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((n) => !n.isRead).length

  // Click-away + Escape. A document listener (not a full-screen overlay): the
  // header's backdrop-blur makes it the containing block for `fixed` children,
  // so an overlay rendered inside it would only cover the header.
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const handleOpenNotification = (notification: Notification) => {
    setIsOpen(false)
    if (!notification.isRead) void markNotificationRead(notification.id)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="通知"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="relative rounded-full border border-[color:var(--border-default)] bg-white/84 p-2.5 text-[color:var(--text-default)] transition duration-200 ease-[var(--ease-out-premium)] hover:bg-white hover:text-[color:var(--text-strong)]"
      >
        <Bell aria-hidden className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[10px] font-semibold text-white shadow-[0_8px_18px_rgba(109,93,246,0.3)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        createPortal(
          <div
            ref={panelRef}
            role="region"
            aria-label="通知"
            className="ui-floating fixed inset-x-4 top-[4.5rem] z-50 overflow-hidden rounded-[1.5rem] sm:inset-x-auto sm:right-6 sm:w-80 lg:right-8"
          >
            <div className="flex items-center justify-between border-b border-[color:var(--border-default)] px-4 py-3">
              <p className="text-sm font-semibold text-[color:var(--text-strong)]">通知</p>
              {unreadCount > 0 && (
                <button onClick={() => void markAllNotificationsRead()} className="text-xs font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent-hover)]">
                  すべて既読にする
                </button>
              )}
            </div>
            <div className="max-h-[min(24rem,calc(100dvh-9rem))] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[color:var(--text-subtle)]">通知はまだありません。</p>
              ) : (
                notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    href={targetHref(notification, drafts)}
                    onClick={() => handleOpenNotification(notification)}
                    className={`block border-b border-black/[0.04] px-4 py-3 text-sm transition duration-200 ease-[var(--ease-out-premium)] hover:bg-black/[0.025] ${
                      notification.isRead ? 'text-[color:var(--text-muted)]' : 'bg-[color:rgba(109,93,246,0.06)] text-[color:var(--text-strong)]'
                    }`}
                  >
                    <p className="font-medium">{notification.title}</p>
                    {notification.body && <p className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">{notification.body}</p>}
                    <p className="mt-1 text-[11px] text-[color:var(--text-subtle)]">{relativeTime(notification.createdAt)}</p>
                  </Link>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      )}
    </div>
  )
}
