// Shared between Sidebar (xl and above) and MobileNav (below xl) so the two
// navigation surfaces can never silently drift apart.
export interface NavItem {
  label: string
  href: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: '⊞' },
  { label: 'Seeds', href: '/app/seeds', icon: '🌱' },
  { label: 'Brand Profile', href: '/app/brand', icon: '◌' },
  { label: 'Drafts', href: '/app/drafts', icon: '✏️' },
  { label: 'Queue', href: '/app/queue', icon: '📅' },
  { label: 'Analytics', href: '/app/analytics', icon: '📊' },
  { label: 'Inbox', href: '/app/inbox', icon: '📬' },
  { label: 'Team', href: '/app/team', icon: '👥' },
  { label: 'Settings', href: '/app/settings', icon: '⚙️' },
]
