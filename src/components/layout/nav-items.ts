import {
  LayoutGrid,
  Sprout,
  PackageCheck,
  CalendarClock,
  Inbox,
  CalendarDays,
  BarChart3,
  Palette,
  Users,
  Settings2,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'

// Shared between the desktop GroupedSidebar, the mobile bottom nav, and the
// "その他" drawer so every navigation surface stays in sync. Routes are
// unchanged for existing destinations; 投稿パック is the practical one-place
// publishing workspace while 公開予定 remains the detailed job/diagnostic view.
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
      { label: '投稿パック', href: '/app/packs', icon: PackageCheck },
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
      { label: 'スマホ共有診断', href: '/app/share-diagnostics', icon: Smartphone },
    ],
  },
]

/** Whether a nav href is the active section for the current path. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The primary create action, surfaced in the sidebar and as a mobile FAB.
export const CREATE_ACTION = { label: '新しい発信', href: '/app/seeds/new' }
