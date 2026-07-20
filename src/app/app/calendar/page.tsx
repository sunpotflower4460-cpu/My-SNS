'use client'

import { useMemo, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Badge, Button } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import { buildUpcomingAgenda, summarizeSyncOutcomes } from '@/lib/presentation/calendar-presenter'
import type { CalendarEvent, CalendarEventInput } from '@/lib/domain/types'

// The in-app calendar (Phase 3). Events are the workspace's own source of truth;
// a later phase syncs them to Notion / TimeTree. Times are handled in the
// creator's local clock (the sole user is JST); display is pinned to Asia/Tokyo
// to keep SSR and client rendering identical.

interface FormState {
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string
  description: string
}

const EMPTY_FORM: FormState = { title: '', startsAt: '', endsAt: '', allDay: false, location: '', description: '' }

/** ISO (UTC) → a `datetime-local` value in the browser's local clock. */
function toInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateHeading(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
}

export default function CalendarPage() {
  const { calendarEvents, currentMember, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, syncCalendarEvent } = useApp()

  const canManage = Boolean(currentMember && hasPermission(currentMember.role, 'manage_calendar'))

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  // Today-and-future events (JST), grouped by day with 今日 / 明日 labels. Past days
  // are dropped to keep the upcoming schedule calm. Date.now() is fine in the
  // browser; the presenter resolves "today" in Asia/Tokyo.
  const upcoming = useMemo(() => buildUpcomingAgenda(calendarEvents, Date.now()), [calendarEvents])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (event: CalendarEvent) => {
    setEditingId(event.id)
    setForm({
      title: event.title,
      startsAt: toInputValue(event.startsAt),
      endsAt: event.endsAt ? toInputValue(event.endsAt) : '',
      allDay: event.allDay,
      location: event.location ?? '',
      description: event.description ?? '',
    })
    setShowForm(true)
    setError('')
    setFeedback('')
  }

  const handleSubmit = async () => {
    setError('')
    setFeedback('')
    if (!form.title.trim()) {
      setError('タイトルを入力してください。')
      return
    }
    if (!form.startsAt) {
      setError('開始日時を入力してください。')
      return
    }
    const startsIso = new Date(form.startsAt).toISOString()
    const endsIso = form.endsAt ? new Date(form.endsAt).toISOString() : undefined
    if (endsIso && new Date(endsIso).getTime() < new Date(startsIso).getTime()) {
      setError('終了日時は開始日時より後にしてください。')
      return
    }

    const input: CalendarEventInput = {
      title: form.title,
      startsAt: startsIso,
      endsAt: endsIso,
      allDay: form.allDay,
      location: form.location || undefined,
      description: form.description || undefined,
    }

    setBusy(true)
    try {
      if (editingId) {
        await updateCalendarEvent(editingId, input)
        setFeedback('予定を更新しました。')
      } else {
        await createCalendarEvent(input)
        setFeedback('予定を追加しました。')
      }
      resetForm()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '予定を保存できませんでした。')
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async (event: CalendarEvent) => {
    setError('')
    setFeedback('')
    setBusy(true)
    try {
      const outcomes = await syncCalendarEvent(event.id)
      const message = summarizeSyncOutcomes(outcomes)
      if (message.feedback) setFeedback(message.feedback)
      if (message.error) setError(message.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同期できませんでした。')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (event: CalendarEvent) => {
    setError('')
    setFeedback('')
    setBusy(true)
    try {
      await deleteCalendarEvent(event.id)
      setFeedback('予定を削除しました。')
      if (editingId === event.id) resetForm()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '予定を削除できませんでした。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="カレンダー" description="会話から決まった予定や、送信のスケジュールをここで管理します。" />

      {feedback && <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{feedback}</div>}
      {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {canManage && (
        <div className="mb-6">
          {!showForm ? (
            <Button variant="primary" onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM) }}>
              ＋ 予定を追加
            </Button>
          ) : (
            <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100/70">
              <p className="mb-4 text-sm font-semibold text-gray-800">{editingId ? '予定を編集' : '新しい予定'}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">タイトル</span>
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded-2xl border border-stone-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="例: 田中さんと打ち合わせ" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">開始日時</span>
                  <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="rounded-2xl border border-stone-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">終了日時（任意）</span>
                  <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="rounded-2xl border border-stone-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">場所（任意）</span>
                  <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="rounded-2xl border border-stone-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="例: オンライン / 渋谷" />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} className="h-4 w-4 rounded border-stone-300" />
                  終日
                </label>
                <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">メモ（任意）</span>
                  <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="rounded-2xl border border-stone-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button variant="primary" onClick={handleSubmit} loading={busy}>
                  {editingId ? '更新する' : '追加する'}
                </Button>
                <Button variant="secondary" onClick={resetForm} disabled={busy}>
                  キャンセル
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {upcoming.length === 0 ? (
        <EmptyState title="予定はまだありません" description={canManage ? '「予定を追加」から最初の予定を登録できます。' : 'このワークスペースに登録された予定はまだありません。'} />
      ) : (
        <div className="space-y-6">
          {upcoming.map(({ day, relativeLabel, events }) => (
            <div key={day}>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-500">
                {relativeLabel && (
                  <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white">{relativeLabel}</span>
                )}
                {formatDateHeading(events[0].startsAt)}
              </p>
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm shadow-stone-100/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900">{event.title}</p>
                          {event.source === 'extracted' && (
                            <Badge tone="accent" icon={Sparkles}>会話から</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {event.allDay ? '終日' : `${formatTime(event.startsAt)}${event.endsAt ? ` 〜 ${formatTime(event.endsAt)}` : ''}`}
                          {event.location ? `・${event.location}` : ''}
                        </p>
                        {event.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{event.description}</p>}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => handleSync(event)} disabled={busy}>
                            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                            同期
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(event)}>編集</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(event)} disabled={busy}>削除</Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
