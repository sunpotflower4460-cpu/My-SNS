import {
  LayoutGrid,
  Sprout,
  CalendarClock,
  Inbox,
  CalendarDays,
  BarChart3,
  Palette,
  Users,
  Settings2,
  type LucideIcon,
} from 'lucide-react'

// Shared between the desktop GroupedSidebar, the mobile bottom nav, and the
// "その他" drawer so every navigation surface stays in sync. Routes are
// unchanged (UI-PR1 keeps existing URLs); only labels are grouped by the user's
// jobs — つくる・届ける / つながる / 振り返る / 管理 — and icons are unified to lucide.
// 下書き(/app/drafts) is intentionally not in the nav: it's a step within a
// 発信, not a destination — the route still works for existing links.

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface NavGroup {
  heading: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  { heading: '今日', items: [{ label: 'ホーム', href: '/app/dashboard', icon: LayoutGrid }] },
  {
    heading: 'つくる・届ける',
    items: [
      { label: '発信ライブラリ', href: '/app/seeds', icon: Sprout },
      { label: '公開予定', href: '/app/queue', icon: CalendarClock },
    ],
  },
  {
    heading: 'つながる',
    items: [
      { label: '受信箱', href: '/app/inbox', icon: Inbox },
      { label: 'カレンダー', href: '/app/calendar', icon: CalendarDays },
    ],
  },
  { heading: '振り返る', items: [{ label: '分析', href: '/app/analytics', icon: BarChart3 }] },
  {
    heading: '管理',
    items: [
      { label: '発信スタイル', href: '/app/brand', icon: Palette },
      { label: 'チーム', href: '/app/team', icon: Users },
      { label: '接続と設定', href: '/app/settings', icon: Settings2 },
    ],
  },
]

/** Whether a nav href is the active section for the current path. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The primary create action, surfaced in the sidebar and as a mobile FAB.
export const CREATE_ACTION = { label: '新しい発信', href: '/app/seeds/new' }
