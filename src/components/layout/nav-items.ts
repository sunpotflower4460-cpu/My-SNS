// Shared between Sidebar (xl and above) and MobileNav (below xl) so the two
// navigation surfaces can never silently drift apart.
export interface NavItem {
  label: string
  href: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'ダッシュボード', href: '/app/dashboard', icon: '⊞' },
  { label: 'シード', href: '/app/seeds', icon: '🌱' },
  { label: 'ブランドプロフィール', href: '/app/brand', icon: '◌' },
  { label: '下書き', href: '/app/drafts', icon: '✏️' },
  { label: '公開キュー', href: '/app/queue', icon: '📅' },
  { label: '分析', href: '/app/analytics', icon: '📊' },
  { label: '受信箱', href: '/app/inbox', icon: '📬' },
  { label: 'チーム', href: '/app/team', icon: '👥' },
  { label: '設定', href: '/app/settings', icon: '⚙️' },
]
