import type { AuditLog } from '@/lib/domain/types'

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

export function describeAuditLog(log: AuditLog): string {
  const actor = log.actor?.name ?? 'Someone'

  switch (log.action) {
    case 'content_created':
      return `${actor} created content${typeof log.metadata?.title === 'string' ? ` “${log.metadata.title}”` : ''}.`
    case 'content_updated':
      return `${actor} updated a content entry.`
    case 'seed_created':
      return `${actor} captured a Seed${typeof log.metadata?.title === 'string' ? ` “${log.metadata.title}”` : ''}.`
    case 'seed_updated':
      return `${actor} updated a Seed.`
    case 'brand_profile_updated':
      return `${actor} updated the Brand Profile${typeof log.metadata?.name === 'string' ? ` “${log.metadata.name}”` : ''}.`
    case 'member_invited':
      return `${actor} invited ${typeof log.metadata?.email === 'string' ? log.metadata.email : 'a teammate'}.`
    case 'member_removed':
      return `${actor} removed a teammate from the workspace.`
    case 'role_changed':
      return `${actor} changed a teammate role${typeof log.metadata?.role === 'string' ? ` to ${log.metadata.role}` : ''}.`
    case 'draft_edited':
      return `${actor} updated a channel draft${typeof log.metadata?.channel === 'string' ? ` for ${log.metadata.channel}` : typeof log.metadata?.platform === 'string' ? ` for ${log.metadata.platform}` : ''}.`
    case 'queue_item_scheduled':
      return `${actor} moved a queue item back into the schedule.`
    case 'queue_item_cancelled':
      return `${actor} cancelled a queue item.`
    case 'inbox_item_read':
      return `${actor} updated read state on an inbox item.`
    case 'inbox_item_starred':
      return `${actor} updated a starred inbox item.`
    case 'inbox_item_needs_action':
      return `${actor} updated the needs-action state on an inbox item.`
    case 'inbox_note_added':
      return `${actor} added an internal inbox note.`
    case 'workspace_settings_updated':
      return `${actor} updated workspace settings.`
    default:
      return `${actor} made a workspace update.`
  }
}

export function getAuditLogMeta(log: AuditLog): string {
  return formatTimestamp(log.createdAt)
}
