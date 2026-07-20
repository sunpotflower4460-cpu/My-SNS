import {
  LayoutGrid,
  Sprout,
  Palette,
  PencilLine,
  CalendarClock,
  BarChart3,
  Inbox,
  CalendarDays,
  Users,
  Settings2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// A single outline icon set (lucide) to replace the mixed emoji/symbol nav icons
// (§17.4). This mapping lets the nav migrate to real icons without changing the
// nav data shape; existing emoji stay until each surface is migrated.
export const NAV_ICONS: Record<string, LucideIcon> = {
  '/app/dashboard': LayoutGrid,
  '/app/seeds': Sprout,
  '/app/brand': Palette,
  '/app/drafts': PencilLine,
  '/app/queue': CalendarClock,
  '/app/analytics': BarChart3,
  '/app/inbox': Inbox,
  '/app/calendar': CalendarDays,
  '/app/team': Users,
  '/app/settings': Settings2,
}
