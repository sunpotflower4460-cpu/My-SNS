import { CheckCircle2 } from 'lucide-react'
import { Badge, Button } from '@/components/ui/kit'

// One connection row on the 接続と設定 page — a platform's icon, label, handle,
// connection status, and its actions. Consolidates three near-identical blocks
// (OAuth platforms, LINE, read-only extra accounts). Status is an icon+word
// Badge, never colour alone (§17.7). Actions only render when the caller passes
// a handler AND the viewer can manage connections.

export interface ConnectionRowProps {
  icon: string
  label: string
  handle: string
  connected: boolean
  busy?: boolean
  canManage?: boolean
  /** OAuth connect link (rendered as a primary-styled anchor). */
  connectHref?: string
  /** Function-style connect (e.g. LINE). Ignored when connectHref is set. */
  onConnect?: () => void
  onSync?: () => void
  onDisconnect?: () => void
  connectLabel?: string
}

export default function ConnectionRow({
  icon,
  label,
  handle,
  connected,
  busy = false,
  canManage = false,
  connectHref,
  onConnect,
  onSync,
  onDisconnect,
  connectLabel = '接続する',
}: ConnectionRowProps) {
  const canConnect = canManage && (Boolean(connectHref) || Boolean(onConnect))

  return (
    <div className="flex flex-col gap-3 rounded-card border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-white text-sm font-bold text-gray-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="truncate text-xs text-gray-500">{handle}</p>
      </div>

      {connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" icon={CheckCircle2}>接続済み</Badge>
          {canManage && onSync && (
            // Dim (not spin) while busy: `busy` is per-platform, so a spinner
            // here would also spin during a disconnect on the same row.
            <Button size="sm" variant="secondary" onClick={onSync} disabled={busy}>
              受信箱を同期
            </Button>
          )}
          {canManage && onDisconnect && (
            <Button size="sm" variant="destructive" onClick={onDisconnect} disabled={busy}>
              接続を解除
            </Button>
          )}
        </div>
      ) : connectHref && canManage ? (
        <a
          href={connectHref}
          className="inline-flex min-h-touch shrink-0 items-center justify-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 sm:min-h-control"
        >
          {connectLabel}
        </a>
      ) : canConnect ? (
        <Button size="sm" variant="primary" onClick={onConnect} loading={busy}>
          {connectLabel}
        </Button>
      ) : (
        <Badge tone="neutral">未接続</Badge>
      )}
    </div>
  )
}
