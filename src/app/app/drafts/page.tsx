'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import SendAllPanel from '@/components/compose/SendAllPanel'
import ChannelBadge from '@/components/ui/ChannelBadge'
import DraftEditorCard from '@/components/ui/DraftEditorCard'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { useApp } from '@/lib/app/app-provider'
import { CORE_PUBLISHING_CHANNELS, type PublishingChannel, type SocialDraft } from '@/lib/domain/types'
import { hasPermission } from '@/lib/permissions'
import { mergeDraftPublishOptions } from '@/lib/publish/draft-publish-options'
import { type SendAllPlan } from '@/lib/presentation/send-plan'
import { resetTemplateDraft } from '@/lib/services/ai-draft'
import { generatePerformanceThumbnailsForSeed } from '@/lib/media/thumbnail-pipeline'

const TONES = ['calm', 'casual', 'professional', 'playful']
const TONE_LABELS: Record<string, string> = {
  calm: '落ち着いた',
  casual: 'カジュアル',
  professional: 'プロフェッショナル',
  playful: '遊び心のある',
}

/** Survives React Strict Mode remounts so "?autogen=1" does not bill twice. */
const startedAutogen = new Set<string>()

function isUnsavedGeneratedId(id: string): boolean {
  return id.startsWith('generated-')
}

export default function DraftsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    currentMember,
    currentWorkspace,
    drafts,
    generateChannelDrafts,
    getDraftsForSeed,
    getSeedDetail,
    refreshWorkspaceData,
    saveAndApproveDraft,
    saveDraft,
    scheduleDraft,
    seeds,
    socialAccounts,
    triggerPublishJob,
  } = useApp()
  const canApprove = Boolean(currentMember && hasPermission(currentMember.role, 'approve_drafts'))
  const canManageQueue = Boolean(currentMember && hasPermission(currentMember.role, 'manage_queue'))
  const canCreateDrafts = Boolean(currentMember && hasPermission(currentMember.role, 'create_drafts'))
  const canEditDrafts = Boolean(currentMember && hasPermission(currentMember.role, 'edit_drafts'))
  const canSendAll = canApprove && canManageQueue
  const requestedSeedId = searchParams.get('seed')
  const shouldAutogen = searchParams.get('autogen') === '1'
  const [seedId, setSeedId] = useState(requestedSeedId ?? seeds[0]?.id ?? '')
  const [selectedChannels, setSelectedChannels] = useState<PublishingChannel[]>([])
  const [tone, setTone] = useState('calm')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('short')
  const [generatedDrafts, setGeneratedDrafts] = useState<SocialDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [thumbFeedback, setThumbFeedback] = useState('')
  const [liveEdits, setLiveEdits] = useState<Record<string, { text: string; metadata: Record<string, unknown> }>>({})

  const selectedSeed = useMemo(() => seeds.find((seed) => seed.id === seedId) ?? null, [seedId, seeds])
  const selectedSeedAssets = selectedSeed ? getSeedDetail(selectedSeed.id).assets : []
  const existingDrafts = useMemo(() => seedId ? getDraftsForSeed(seedId) : drafts, [drafts, getDraftsForSeed, seedId])
  const draftsByChannel = useMemo(
    () => existingDrafts.reduce<Record<string, SocialDraft[]>>((accumulator, draft) => {
      accumulator[draft.channel] = [...(accumulator[draft.channel] ?? []), draft]
      return accumulator
    }, {}),
    [existingDrafts],
  )
  const applyLiveEdits = (draft: SocialDraft): SocialDraft => {
    const live = liveEdits[draft.id]
    if (!live) return draft
    return { ...draft, draftText: live.text, metadata: live.metadata }
  }

  const sendableDrafts = useMemo(() => {
    const byId = new Map<string, SocialDraft>()
    for (const draft of existingDrafts) byId.set(draft.id, applyLiveEdits(draft))
    for (const draft of generatedDrafts) byId.set(draft.id, applyLiveEdits(draft))
    return [...byId.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyLiveEdits is a local closure over liveEdits
  }, [existingDrafts, generatedDrafts, liveEdits])

  useEffect(() => {
    if (requestedSeedId) {
      if (seeds.length === 0 || seeds.some((seed) => seed.id === requestedSeedId)) {
        setSeedId(requestedSeedId)
        return
      }
    }
    if (seeds.length > 0 && !seeds.some((seed) => seed.id === seedId)) setSeedId(seeds[0].id)
  }, [requestedSeedId, seedId, seeds])

  // Only reset channel picks / unsaved AI drafts when the selected Seed *id*
  // changes. refreshWorkspaceData() rebuilds Seed object identity often, and
  // keying this effect on the whole object was wiping in-progress edits.
  useEffect(() => {
    if (!selectedSeed) return
    setSelectedChannels(selectedSeed.targetChannels.length > 0 ? selectedSeed.targetChannels : [...CORE_PUBLISHING_CHANNELS])
    setGeneratedDrafts([])
    setLiveEdits({})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: seed id only
  }, [selectedSeed?.id])

  const toggleChannel = (channel: PublishingChannel) => {
    setSelectedChannels((current) => current.includes(channel)
      ? current.filter((entry) => entry !== channel)
      : [...current, channel])
  }

  const handleGenerate = async (channels = selectedChannels) => {
    if (!selectedSeed || channels.length === 0) return
    setLoading(true)
    setError('')
    setWarning('')
    setThumbFeedback('')
    try {
      const result = await generateChannelDrafts(selectedSeed.id, channels, tone, length)
      const usageWarning = (result as typeof result & { usageWarning?: string }).usageWarning
      let nextDrafts = result.drafts
      if (currentWorkspace) {
        try {
          const thumbs = await generatePerformanceThumbnailsForSeed({
            workspaceId: currentWorkspace.id,
            seedId: selectedSeed.id,
            seedTitle: selectedSeed.title,
            assets: getSeedDetail(selectedSeed.id).assets,
            drafts: nextDrafts,
          })
          nextDrafts = thumbs.drafts
          setThumbFeedback(thumbs.message)
          if (thumbs.assets.length > 0) await refreshWorkspaceData()
        } catch (cause) {
          setThumbFeedback(
            cause instanceof Error
              ? cause.message
              : '文字入りサムネイルの作成に失敗しました。PNG/JPGをアップロードしてください。',
          )
        }
      }
      setGeneratedDrafts(nextDrafts)
      setWarning(usageWarning ?? '')
      setFeedback(
        result.source === 'ai'
          ? `AIが${result.drafts.length}件の提案を作成しました。${
              result.styleExamplesUsed
                ? `過去に直した承認版${result.styleExamplesUsed}件を今回の提案に反映しています。`
                : '直して承認すると、同じ媒体の次回提案に反映されます。'
            }下のチェックからまとめて送れます。`
          : result.reason ?? `${result.drafts.length}件のテンプレートを作成しました。中身がそのまま分かるテンプレートで、AIによる提案ではありません。`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '下書きを作成できませんでした。')
      setFeedback('')
      setWarning('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!shouldAutogen || !selectedSeed || !canCreateDrafts) return
    if (startedAutogen.has(selectedSeed.id)) {
      router.replace(`/app/drafts?seed=${selectedSeed.id}`)
      return
    }
    const channels = selectedSeed.targetChannels.length > 0
      ? selectedSeed.targetChannels
      : [...CORE_PUBLISHING_CHANNELS]
    startedAutogen.add(selectedSeed.id)
    router.replace(`/app/drafts?seed=${selectedSeed.id}`)
    void handleGenerate(channels)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per seed after 提案をもらう
  }, [canCreateDrafts, selectedSeed?.id, shouldAutogen])

  const toDraftInput = (draft: SocialDraft) => ({
    ...(isUnsavedGeneratedId(draft.id) ? {} : { id: draft.id }),
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
    aiOriginalSnapshot: draft.aiOriginalSnapshot,
  })

  const persistDraft = async (draft: SocialDraft) => saveDraft(toDraftInput(draft))

  const rememberLive = (id: string, text: string, metadata: Record<string, unknown>) => {
    setLiveEdits((current) => ({ ...current, [id]: { text, metadata } }))
  }

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

  const handleSendAll = async (plan: SendAllPlan) => {
    setSending(true)
    setError('')
    const sent: string[] = []
    const problems: string[] = []
    const sentGeneratedIds = new Set<string>()
    const byId = new Map(sendableDrafts.map((draft) => [draft.id, draft]))

    for (const target of plan.targets) {
      const draft = byId.get(target.draftId)
      if (!draft) {
        problems.push(`${target.label}: 下書きが見つかりません。`)
        continue
      }

      try {
        const metadata = mergeDraftPublishOptions(draft.metadata, { socialAccountId: target.selectedAccountId })
        const withAccount = { ...draft, metadata }
        const approved = await saveAndApproveDraft(toDraftInput(withAccount))

        if (isUnsavedGeneratedId(draft.id)) sentGeneratedIds.add(draft.id)

        const scheduledAt = plan.timing === 'scheduled' && plan.scheduledAt
          ? plan.scheduledAt
          : new Date().toISOString()
        const job = await scheduleDraft(approved.id, scheduledAt)

        if (plan.timing === 'now' && !target.noteHandoff) {
          try {
            await triggerPublishJob(job.id)
          } catch (cause) {
            problems.push(`${target.label}: ${cause instanceof Error ? cause.message : '公開を開始できませんでした。公開予定から確認してください。'}`)
            sent.push(target.label)
            continue
          }
        }

        sent.push(target.label)
      } catch (cause) {
        problems.push(`${target.label}: ${cause instanceof Error ? cause.message : '送れませんでした。'}`)
      }
    }

    if (sentGeneratedIds.size > 0) {
      setGeneratedDrafts((current) => current.filter((draft) => !sentGeneratedIds.has(draft.id)))
    }

    if (sent.length > 0) {
      const timingNote = plan.timing === 'now'
        ? '今すぐ公開を試みました。noteはコピー用として公開予定に残します。'
        : '予約しました。公開予定から確認できます。'
      setFeedback(`${sent.join('、')}を受け付けました。${timingNote}`)
    } else {
      setFeedback('')
    }
    setError(problems.join('\n'))
    setSending(false)
  }

  return (
    <div className="pb-24 xl:pb-0">
      <PageHeader
        title="下書きスタジオ"
        description="提案を直して、下のチェックで媒体と時間を選んでまとめて送れます。直して承認した内容は同じ媒体の次回AI提案に反映されます。AIの下書きには仮定が示され、確認するまで承認されません。"
      />

      {(feedback || error) && (
        <div className={`mb-5 whitespace-pre-line rounded-2xl border px-4 py-3 text-sm ${error && !feedback ? 'border-red-200 bg-red-50 text-red-700' : error ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {feedback}{feedback && error ? '\n' : ''}{error}
        </div>
      )}
      {warning && !error && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning} 続けて大量生成する前に、管理者へ使用量台帳の確認を依頼してください。</div>}

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
          <button onClick={() => void handleGenerate()} disabled={!canCreateDrafts || loading || selectedChannels.length === 0 || !selectedSeed} className="mt-5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50">{loading ? '作成中…' : canCreateDrafts ? '下書きを作成' : '作成権限がありません'}</button>
          {thumbFeedback && <p className="mt-3 text-xs leading-5 text-gray-600">{thumbFeedback}</p>}
        </div>
      )}

      {generatedDrafts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-gray-900">未保存の下書き</h2>
          <p className="mb-3 text-xs text-gray-500">文字入りサムネイルが2〜3枚ある場合は、YouTube案で一番強い候補が選ばれています。別の候補をクリックして切り替えてください。</p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {generatedDrafts.map((draft) => (
              <DraftEditorCard
                key={draft.id}
                draft={draft}
                connectedAccounts={socialAccounts}
                seedAssets={selectedSeedAssets}
                onLiveChange={rememberLive}
                onEdit={canEditDrafts ? (id, text, metadata) => {
                  const target = generatedDrafts.find((entry) => entry.id === id)
                  setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: text, metadata, updatedAt: new Date().toISOString() } : entry))
                  if (target) void runDraftAction(() => persistDraft({ ...target, draftText: text, metadata }), `${PUBLISHING_CHANNEL_CONFIG[target.channel].label}の下書きを保存しました。`)
                } : undefined}
                onApprove={canApprove ? (id, text, metadata) => {
                  const target = generatedDrafts.find((entry) => entry.id === id)
                  if (!target) return
                  void runDraftAction(
                    async () => {
                      await saveAndApproveDraft(toDraftInput({ ...target, draftText: text, metadata }))
                      setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: text, metadata, status: 'approved' } : entry))
                    },
                    `${PUBLISHING_CHANNEL_CONFIG[target.channel].label}の下書きを承認し、承認版（Revision）として記録しました。`,
                  )
                } : undefined}
                onRegenerate={canEditDrafts ? (id) => {
                  if (!selectedSeed) return
                  setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: resetTemplateDraft(entry, selectedSeed), updatedAt: new Date().toISOString() } : entry))
                  setFeedback('この下書きを元のテンプレートに戻しました。')
                } : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {sendableDrafts.length > 0 && (
        <section className="mb-8">
          <SendAllPanel
            drafts={sendableDrafts}
            accounts={socialAccounts}
            canSend={canSendAll}
            busy={sending}
            onSend={handleSendAll}
          />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-900">保存済みの下書き</h2>{selectedSeed && <span className="text-sm text-gray-500">{selectedSeed.title}</span>}</div>
        {existingDrafts.length === 0 ? <EmptyState title="まだ下書きがありません" description="テンプレートを作成し、残しておきたいバージョンを保存してください。" /> : (
          <div className="space-y-6">
            {Object.entries(draftsByChannel).map(([channel, channelDrafts]) => (
              <section key={channel}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{PUBLISHING_CHANNEL_CONFIG[channel as PublishingChannel].label}</h3>
                  <span className="text-xs text-gray-400">{channelDrafts.length}件保存済み</span>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {channelDrafts.map((draft) => (
                    <DraftEditorCard
                      key={draft.id}
                      draft={draft}
                      connectedAccounts={socialAccounts}
                      seedAssets={selectedSeedAssets}
                      onLiveChange={rememberLive}
                      onEdit={canEditDrafts ? (id, text, metadata) => {
                        const target = existingDrafts.find((entry) => entry.id === id)
                        if (target) void runDraftAction(() => persistDraft({ ...target, draftText: text, metadata }), `${PUBLISHING_CHANNEL_CONFIG[target.channel].label}の下書きを保存しました。`)
                      } : undefined}
                      onApprove={canApprove ? (id, text, metadata) => {
                        const target = existingDrafts.find((entry) => entry.id === id)
                        if (!target) return
                        void runDraftAction(() => saveAndApproveDraft({ ...toDraftInput(target), draftText: text, metadata, id: target.id }), '下書きを承認し、承認版として記録しました。')
                      } : undefined}
                      onRegenerate={canEditDrafts ? (id) => {
                        if (!selectedSeed) return
                        const target = existingDrafts.find((entry) => entry.id === id)
                        if (target) void runDraftAction(() => persistDraft({ ...target, draftText: resetTemplateDraft(target, selectedSeed) }), '元のテンプレートに戻して保存しました。')
                      } : undefined}
                      onSchedule={canManageQueue ? (id, scheduledAt, metadata) => {
                        void runDraftAction(async () => {
                          const target = existingDrafts.find((entry) => entry.id === id)
                          if (target && metadata) await persistDraft({ ...target, metadata })
                          await scheduleDraft(id, scheduledAt)
                        }, '予約しました。公開キューから確認できます。')
                      } : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
