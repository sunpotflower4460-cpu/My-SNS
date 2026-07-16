'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ChannelBadge from '@/components/ui/ChannelBadge'
import DraftEditorCard from '@/components/ui/DraftEditorCard'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { useApp } from '@/lib/app/app-provider'
import { CORE_PUBLISHING_CHANNELS, type PublishingChannel, type SocialDraft } from '@/lib/domain/types'
import { hasPermission } from '@/lib/permissions'
import { resetTemplateDraft } from '@/lib/services/ai-draft'

const TONES = ['calm', 'casual', 'professional', 'playful']
const TONE_LABELS: Record<string, string> = {
  calm: '落ち着いた',
  casual: 'カジュアル',
  professional: 'プロフェッショナル',
  playful: '遊び心のある',
}

export default function DraftsPage() {
  const searchParams = useSearchParams()
  const { approveDraft, currentMember, drafts, generateChannelDrafts, getDraftsForSeed, saveAndApproveDraft, saveDraft, scheduleDraft, seeds } = useApp()
  const canApprove = Boolean(currentMember && hasPermission(currentMember.role, 'approve_drafts'))
  const canManageQueue = Boolean(currentMember && hasPermission(currentMember.role, 'manage_queue'))
  const requestedSeedId = searchParams.get('seed')
  const [seedId, setSeedId] = useState(requestedSeedId ?? seeds[0]?.id ?? '')
  const [selectedChannels, setSelectedChannels] = useState<PublishingChannel[]>([])
  const [tone, setTone] = useState('calm')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('short')
  const [generatedDrafts, setGeneratedDrafts] = useState<SocialDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const selectedSeed = useMemo(() => seeds.find((seed) => seed.id === seedId) ?? null, [seedId, seeds])
  const existingDrafts = useMemo(() => seedId ? getDraftsForSeed(seedId) : drafts, [drafts, getDraftsForSeed, seedId])
  const draftsByChannel = useMemo(
    () => existingDrafts.reduce<Record<string, SocialDraft[]>>((accumulator, draft) => {
      accumulator[draft.channel] = [...(accumulator[draft.channel] ?? []), draft]
      return accumulator
    }, {}),
    [existingDrafts],
  )

  useEffect(() => {
    if (seeds.length > 0 && !seeds.some((seed) => seed.id === seedId)) setSeedId(seeds[0].id)
  }, [seedId, seeds])

  useEffect(() => {
    if (!selectedSeed) return
    setSelectedChannels(selectedSeed.targetChannels.length > 0 ? selectedSeed.targetChannels : [...CORE_PUBLISHING_CHANNELS])
    setGeneratedDrafts([])
  }, [selectedSeed])

  const toggleChannel = (channel: PublishingChannel) => {
    setSelectedChannels((current) => current.includes(channel)
      ? current.filter((entry) => entry !== channel)
      : [...current, channel])
  }

  const handleGenerate = async () => {
    if (!selectedSeed) return
    setLoading(true)
    setError('')
    try {
      const result = await generateChannelDrafts(selectedSeed.id, selectedChannels, tone, length)
      setGeneratedDrafts(result.drafts)
      setFeedback(
        result.source === 'ai'
          ? `AIが${result.drafts.length}件の提案を作成しました。承認する前に仮定を確認してください。`
          : result.reason ?? `${result.drafts.length}件のテンプレートを作成しました。中身がそのまま分かるテンプレートで、AIによる提案ではありません。`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '下書きを作成できませんでした。')
      setFeedback('')
    } finally {
      setLoading(false)
    }
  }

  const toDraftInput = (draft: SocialDraft) => ({
    ...(draft.id.startsWith('generated-') ? {} : { id: draft.id }),
    workspaceId: draft.workspaceId,
    seedId: draft.seedId,
    channel: draft.channel,
    title: draft.title,
    tone: draft.tone,
    length: draft.length,
    draftText: draft.draftText,
    hashtags: draft.hashtags,
    cta: draft.cta,
    assumptions: draft.assumptions,
    metadata: draft.metadata,
    source: draft.source,
    status: draft.status,
    createdBy: draft.createdBy,
  })

  const persistDraft = async (draft: SocialDraft) => saveDraft(toDraftInput(draft))

  const runDraftAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action()
      setFeedback(successMessage)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '下書きを保存できませんでした。')
      setFeedback('')
    }
  }

  return (
    <div>
      <PageHeader title="下書きスタジオ" description="1つのシードから媒体ごとの提案を作成します。AIの下書きには必ず仮定（AIの推測）が示され、あなたが確認するまで何も承認されません。" />

      {(feedback || error) && <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{error || feedback}</div>}

      {seeds.length === 0 ? (
        <EmptyState title="下書きを作成できるシードがありません" description="まず情報源を1つ記録してから、媒体ごとの下書きを準備してください。" action={<Link href="/app/seeds/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">シードを記録する</Link>} icon="✍️" />
      ) : (
        <div className="mb-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
            <div><label className="mb-2 block text-sm font-medium text-gray-700">元になるシード</label><select value={seedId} onChange={(event) => setSeedId(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">{seeds.map((seed) => <option key={seed.id} value={seed.id}>{seed.title} · {seed.status}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-medium text-gray-700">テンプレートのトーン</label><select value={tone} onChange={(event) => setTone(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">{TONES.map((option) => <option key={option} value={option}>{TONE_LABELS[option] ?? option}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-medium text-gray-700">長さ</label><select value={length} onChange={(event) => setLength(event.target.value as 'short' | 'medium' | 'long')} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"><option value="short">短め</option><option value="medium">ふつう</option><option value="long">長め</option></select></div>
          </div>

          <div className="mt-4"><label className="mb-2 block text-sm font-medium text-gray-700">このシードの媒体</label><div className="flex flex-wrap gap-2">{CORE_PUBLISHING_CHANNELS.map((channel) => <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-full transition ${selectedChannels.includes(channel) ? 'ring-2 ring-violet-400 ring-offset-2' : 'opacity-50 hover:opacity-80'}`}><ChannelBadge channel={channel} /></button>)}</div></div>
          {selectedChannels.includes('note') && <p className="mt-3 text-xs text-emerald-700">noteは引き続き「確認してコピー」のみに対応しています。このアプリが自動投稿を行うことはありません。</p>}
          <button onClick={() => void handleGenerate()} disabled={loading || selectedChannels.length === 0 || !selectedSeed} className="mt-5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50">{loading ? '作成中…' : '下書きを作成'}</button>
        </div>
      )}

      {generatedDrafts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-gray-900">未保存の下書き</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {generatedDrafts.map((draft) => (
              <DraftEditorCard
                key={draft.id}
                draft={draft}
                onEdit={(id, text) => {
                  const target = generatedDrafts.find((entry) => entry.id === id)
                  setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: text, updatedAt: new Date().toISOString() } : entry))
                  if (target) void runDraftAction(() => persistDraft({ ...target, draftText: text }), `${PUBLISHING_CHANNEL_CONFIG[target.channel].label}の下書きを保存しました。`)
                }}
                onApprove={canApprove ? (id) => {
                  const target = generatedDrafts.find((entry) => entry.id === id)
                  if (!target) return
                  void runDraftAction(
                    async () => {
                      await saveAndApproveDraft(toDraftInput(target))
                      setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, status: 'approved' } : entry))
                    },
                    `${PUBLISHING_CHANNEL_CONFIG[target.channel].label}の下書きを承認し、承認版（Revision）として記録しました。`,
                  )
                } : undefined}
                onRegenerate={(id) => {
                  if (!selectedSeed) return
                  setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: resetTemplateDraft(entry, selectedSeed), updatedAt: new Date().toISOString() } : entry))
                  setFeedback('この下書きを元のテンプレートに戻しました。')
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-900">保存済みの下書き</h2>{selectedSeed && <span className="text-sm text-gray-500">{selectedSeed.title}</span>}</div>
        {existingDrafts.length === 0 ? <EmptyState title="まだ下書きがありません" description="テンプレートを作成し、残しておきたいバージョンを保存してください。" /> : (
          <div className="space-y-6">
            {Object.entries(draftsByChannel).map(([channel, channelDrafts]) => <section key={channel}><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-700">{PUBLISHING_CHANNEL_CONFIG[channel as PublishingChannel].label}</h3><span className="text-xs text-gray-400">{channelDrafts.length}件保存済み</span></div><div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{channelDrafts.map((draft) => <DraftEditorCard key={draft.id} draft={draft} onEdit={(id, text) => { const target = existingDrafts.find((entry) => entry.id === id); if (target) void runDraftAction(() => persistDraft({ ...target, draftText: text }), `${PUBLISHING_CHANNEL_CONFIG[target.channel].label}の下書きを保存しました。`) }} onApprove={canApprove ? (id) => { void runDraftAction(() => approveDraft(id), '下書きを承認し、承認版として記録しました。') } : undefined} onRegenerate={(id) => { if (!selectedSeed) return; const target = existingDrafts.find((entry) => entry.id === id); if (target) void runDraftAction(() => persistDraft({ ...target, draftText: resetTemplateDraft(target, selectedSeed) }), '元のテンプレートに戻して保存しました。') }} onSchedule={canManageQueue ? (id, scheduledAt) => { void runDraftAction(() => scheduleDraft(id, scheduledAt), '予約しました。公開キューから確認できます。') } : undefined} />)}</div></section>)}
          </div>
        )}
      </section>
    </div>
  )
}
