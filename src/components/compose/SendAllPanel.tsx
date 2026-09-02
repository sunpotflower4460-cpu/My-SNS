'use client'

import { useEffect, useState } from 'react'
import { Button, Card, InlineAlert, SegmentedControl, StickyActionBar } from '@/components/ui/kit'
import { PUBLISH_WORKER_DELAY_JA } from '@/lib/presentation/cron-honesty'
import {
  buildSendChannelState,
  latestDraftsByChannel,
  validateSendPlan,
  type SendAllPlan,
  type SendChannelState,
  type SendTiming,
} from '@/lib/presentation/send-plan'
import type { SocialAccount, SocialDraft } from '@/lib/domain/types'

function clientScheduleInputValue(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

interface SendAllPanelProps {
  drafts: SocialDraft[]
  accounts: SocialAccount[]
  canSend: boolean
  busy?: boolean
  onSend: (plan: SendAllPlan) => Promise<void>
}

export default function SendAllPanel({ drafts, accounts, canSend, busy = false, onSend }: SendAllPanelProps) {
  const [channels, setChannels] = useState<SendChannelState[]>([])
  const [timing, setTiming] = useState<SendTiming>('now')
  const [scheduleInput, setScheduleInput] = useState('')
  const [error, setError] = useState('')

  const draftKey = drafts.map((draft) => `${draft.id}:${draft.updatedAt}:${draft.status}`).join('|')
  const accountKey = accounts.map((account) => `${account.id}:${account.connected}`).join('|')

  useEffect(() => {
    const next = latestDraftsByChannel(drafts).map((draft) => buildSendChannelState(draft, accounts))
    setChannels(next)
    setError('')
  }, [accountKey, draftKey, accounts, drafts])

  useEffect(() => {
    setScheduleInput(clientScheduleInputValue())
  }, [])

  if (channels.length === 0) return null

  const updateChannel = (channelId: SendChannelState['channel'], patch: Partial<SendChannelState>) => {
    setChannels((current) => current.map((entry) => {
      if (entry.channel !== channelId) return entry
      const next = { ...entry, ...patch }
      if (next.accounts.length > 1 && next.selected && !next.selectedAccountId) {
        next.blockedReason = '投稿するアカウントを選んでください。'
      } else if (next.accounts.length === 0 && !next.noteHandoff) {
        next.blockedReason = '設定からアカウントを接続してください。'
      } else if (next.selectedAccountId || next.noteHandoff) {
        next.blockedReason = undefined
      }
      return next
    }))
  }

  const handleSend = async () => {
    const scheduledAt = timing === 'scheduled' && scheduleInput
      ? new Date(scheduleInput).toISOString()
      : undefined
    const result = validateSendPlan(channels, timing, scheduledAt)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    await onSend({ timing, scheduledAt, targets: result.targets })
  }

  const selectedCount = channels.filter((channel) => channel.selected).length

  return (
    <Card size="container" padded className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-[color:var(--accent)]">まとめて送る</p>
        <h2 className="mt-1 text-base font-semibold text-[color:var(--text-strong)]">媒体と時間を選ぶ</h2>
        <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">チェックした媒体へ、同じタイミングで出します。本文の修正は上のカードでどうぞ。</p>
      </div>

      <ul className="space-y-2">
        {channels.map((channel) => (
          <li key={channel.channel} className="rounded-card border border-[color:var(--border-default)] bg-white/80 px-3 py-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={channel.selected}
                disabled={Boolean(channel.blockedReason) && channel.accounts.length === 0 && !channel.noteHandoff}
                onChange={(event) => updateChannel(channel.channel, { selected: event.target.checked })}
                className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[color:var(--text-strong)]">{channel.label}</span>
                {channel.noteHandoff && (
                  <span className="mt-0.5 block text-[11px] text-emerald-700">確認してコピーする媒体です。自動投稿しません。</span>
                )}
                {channel.blockedReason && !channel.noteHandoff && (
                  <span className="mt-0.5 block text-[11px] text-amber-700">{channel.blockedReason}</span>
                )}
              </span>
            </label>
            {channel.accounts.length > 1 && (
              <select
                value={channel.selectedAccountId ?? ''}
                onChange={(event) => updateChannel(channel.channel, {
                  selectedAccountId: event.target.value || undefined,
                  selected: Boolean(event.target.value),
                })}
                className="ui-input mt-2 w-full rounded-control px-2.5 py-2 text-xs focus:outline-none"
              >
                <option value="">アカウントを選ぶ</option>
                {channel.accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.handle}</option>
                ))}
              </select>
            )}
            {channel.accounts.length === 1 && (
              <p className="mt-1 pl-7 text-[11px] text-[color:var(--text-subtle)]">{channel.accounts[0].handle}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <SegmentedControl
          ariaLabel="公開のタイミング"
          value={timing}
          onChange={setTiming}
          options={[
            { value: 'now', label: '今すぐ' },
            { value: 'scheduled', label: '予約する' },
          ]}
        />
        {timing === 'scheduled' && (
          <label className="block text-xs">
            <span className="font-medium text-[color:var(--text-default)]">公開日時</span>
            <input
              type="datetime-local"
              value={scheduleInput}
              onChange={(event) => setScheduleInput(event.target.value)}
              className="ui-input mt-1 w-full rounded-control px-2.5 py-2 text-sm focus:outline-none"
            />
          </label>
        )}
        <p className="text-[11px] leading-5 text-[color:var(--text-subtle)]">
          {timing === 'now' ? '接続済みの媒体はすぐ公開を試します。' : PUBLISH_WORKER_DELAY_JA}
        </p>
      </div>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      <StickyActionBar>
        <p className="min-w-0 text-xs text-[color:var(--text-muted)]">{selectedCount}媒体</p>
        <Button variant="primary" disabled={!canSend || busy || selectedCount === 0} loading={busy} onClick={() => void handleSend()}>
          {timing === 'now' ? '選んだ媒体に送る' : '選んだ媒体を予約する'}
        </Button>
      </StickyActionBar>
    </Card>
  )
}
