'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/app/app-provider'
import type { Notification } from '@/lib/domain/types'

const TARGET_HREF: Record<string, string> = {
  social_draft: '/app/drafts',
  publish_job: '/app/queue',
  inbox_item: '/app/inbox',
}

function targetHref(notification: Notification): string {
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
  const { markAllNotificationsRead, markNotificationRead, notifications } = useApp()
  const [isOpen, setIsOpen] = useState(false)
  const unreadCount = notifications.filter((n) => !n.isRead).length

  const handleOpenNotification = (notification: Notification) => {
    setIsOpen(false)
    if (!notification.isRead) void markNotificationRead(notification.id)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((open) => !open)}
        aria-label="通知"
        className="relative rounded-xl border border-stone-200 bg-white p-2.5 text-gray-600 transition hover:bg-stone-50"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <button aria-label="通知を閉じる" onClick={() => setIsOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">通知</p>
              {unreadCount > 0 && (
                <button onClick={() => void markAllNotificationsRead()} className="text-xs font-medium text-violet-600 hover:text-violet-800">
                  すべて既読にする
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">通知はまだありません。</p>
              ) : (
                notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    href={targetHref(notification)}
                    onClick={() => handleOpenNotification(notification)}
                    className={`block border-b border-stone-50 px-4 py-3 text-sm transition hover:bg-stone-50 ${notification.isRead ? 'text-gray-500' : 'bg-violet-50/40 text-gray-900'}`}
                  >
                    <p className="font-medium">{notification.title}</p>
                    {notification.body && <p className="mt-0.5 truncate text-xs text-gray-500">{notification.body}</p>}
                    <p className="mt-1 text-[11px] text-gray-400">{relativeTime(notification.createdAt)}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
