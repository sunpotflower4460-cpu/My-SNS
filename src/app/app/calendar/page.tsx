'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
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

/** The JST calendar day an event belongs to, as a stable grouping key. */
function jstDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) // YYYY-MM-DD
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

  const grouped = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>()
    for (const event of calendarEvents) {
      const key = jstDayKey(event.startsAt)
      const list = groups.get(key) ?? []
      list.push(event)
      groups.set(key, list)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [calendarEvents])

  // Show today and future days (JST). Past days are kept out of the main view to
  // keep the upcoming schedule uncluttered.
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  const upcoming = grouped.filter(([day]) => day >= todayKey)

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

  const PROVIDER_LABELS: Record<string, string> = { notion: 'Notion', timetree: 'TimeTree' }

  const handleSync = async (event: CalendarEvent) => {
    setError('')
    setFeedback('')
    setBusy(true)
    try {
      const outcomes = await syncCalendarEvent(event.id)
      const synced = outcomes.filter((o) => o.status === 'synced').map((o) => PROVIDER_LABELS[o.provider] ?? o.provider)
      const failed = outcomes.filter((o) => o.status === 'failed').map((o) => PROVIDER_LABELS[o.provider] ?? o.provider)
      const available = outcomes.some((o) => o.status !== 'unavailable')
      if (!available) {
        setError('外部カレンダー連携（Notion / TimeTree）が未設定です。設定でトークンを設定すると同期できます。')
      } else if (failed.length > 0) {
        setError(`同期に失敗しました: ${failed.join('、')}。`)
      } else {
        setFeedback(`${synced.join('、')}に同期しました。`)
      }
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
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM) }} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
              ＋ 予定を追加
            </button>
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
                <button onClick={handleSubmit} disabled={busy} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
                  {busy ? '保存中…' : editingId ? '更新する' : '追加する'}
                </button>
                <button onClick={resetForm} disabled={busy} className="rounded-full border border-stone-200 px-4 py-2 text-sm text-gray-600 hover:bg-stone-50 disabled:opacity-50">
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {upcoming.length === 0 ? (
        <EmptyState title="予定はまだありません" description={canManage ? '「予定を追加」から最初の予定を登録できます。' : 'このワークスペースに登録された予定はまだありません。'} />
      ) : (
        <div className="space-y-6">
          {upcoming.map(([day, events]) => (
            <div key={day}>
              <p className="mb-2 text-sm font-semibold text-gray-500">{formatDateHeading(events[0].startsAt)}</p>
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm shadow-stone-100/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900">{event.title}</p>
                          {event.source === 'extracted' && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">会話から</span>}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {event.allDay ? '終日' : `${formatTime(event.startsAt)}${event.endsAt ? ` 〜 ${formatTime(event.endsAt)}` : ''}`}
                          {event.location ? `・${event.location}` : ''}
                        </p>
                        {event.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{event.description}</p>}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button onClick={() => handleSync(event)} disabled={busy} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50">同期</button>
                          <button onClick={() => startEdit(event)} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-stone-50">編集</button>
                          <button onClick={() => handleDelete(event)} disabled={busy} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-gray-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">削除</button>
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
