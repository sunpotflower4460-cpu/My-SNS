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
          ? `Prepared ${result.drafts.length} AI proposals. Review the assumptions before approving.`
          : result.reason ?? `Prepared ${result.drafts.length} transparent templates. They are not AI proposals yet.`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate drafts.')
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
      setError(cause instanceof Error ? cause.message : 'Unable to save the draft.')
      setFeedback('')
    }
  }

  return (
    <div>
      <PageHeader title="Draft Studio" description="Generate channel proposals from one Seed. AI drafts always show their assumptions; nothing is approved until you review it." />

      {(feedback || error) && <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{error || feedback}</div>}

      {seeds.length === 0 ? (
        <EmptyState title="No Seeds ready for draft work" description="Capture one source first, then return to prepare channel-specific drafts." action={<Link href="/app/seeds/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">Capture a Seed</Link>} icon="✍️" />
      ) : (
        <div className="mb-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
            <div><label className="mb-2 block text-sm font-medium text-gray-700">Source Seed</label><select value={seedId} onChange={(event) => setSeedId(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">{seeds.map((seed) => <option key={seed.id} value={seed.id}>{seed.title} · {seed.status}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-medium text-gray-700">Template tone</label><select value={tone} onChange={(event) => setTone(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">{TONES.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-medium text-gray-700">Length</label><select value={length} onChange={(event) => setLength(event.target.value as 'short' | 'medium' | 'long')} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></div>
          </div>

          <div className="mt-4"><label className="mb-2 block text-sm font-medium text-gray-700">Channels from this Seed</label><div className="flex flex-wrap gap-2">{CORE_PUBLISHING_CHANNELS.map((channel) => <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-full transition ${selectedChannels.includes(channel) ? 'ring-2 ring-violet-400 ring-offset-2' : 'opacity-50 hover:opacity-80'}`}><ChannelBadge channel={channel} /></button>)}</div></div>
          {selectedChannels.includes('note') && <p className="mt-3 text-xs text-emerald-700">note remains review + copy only; this app will not claim an automatic publishing path.</p>}
          <button onClick={() => void handleGenerate()} disabled={loading || selectedChannels.length === 0 || !selectedSeed} className="mt-5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50">{loading ? 'Generating…' : 'Generate drafts'}</button>
        </div>
      )}

      {generatedDrafts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Unsaved drafts</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {generatedDrafts.map((draft) => (
              <DraftEditorCard
                key={draft.id}
                draft={draft}
                onEdit={(id, text) => {
                  const target = generatedDrafts.find((entry) => entry.id === id)
                  setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: text, updatedAt: new Date().toISOString() } : entry))
                  if (target) void runDraftAction(() => persistDraft({ ...target, draftText: text }), `Saved ${PUBLISHING_CHANNEL_CONFIG[target.channel].label} draft.`)
                }}
                onApprove={canApprove ? (id) => {
                  const target = generatedDrafts.find((entry) => entry.id === id)
                  if (!target) return
                  void runDraftAction(
                    async () => {
                      await saveAndApproveDraft(toDraftInput(target))
                      setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, status: 'approved' } : entry))
                    },
                    `Approved ${PUBLISHING_CHANNEL_CONFIG[target.channel].label} draft and recorded a Revision.`,
                  )
                } : undefined}
                onRegenerate={(id) => {
                  if (!selectedSeed) return
                  setGeneratedDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, draftText: resetTemplateDraft(entry, selectedSeed), updatedAt: new Date().toISOString() } : entry))
                  setFeedback('Reset that draft to its source template.')
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-900">Saved drafts</h2>{selectedSeed && <span className="text-sm text-gray-500">{selectedSeed.title}</span>}</div>
        {existingDrafts.length === 0 ? <EmptyState title="No drafts yet" description="Prepare a template and save the versions worth keeping." /> : (
          <div className="space-y-6">
            {Object.entries(draftsByChannel).map(([channel, channelDrafts]) => <section key={channel}><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-700">{PUBLISHING_CHANNEL_CONFIG[channel as PublishingChannel].label}</h3><span className="text-xs text-gray-400">{channelDrafts.length} saved</span></div><div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{channelDrafts.map((draft) => <DraftEditorCard key={draft.id} draft={draft} onEdit={(id, text) => { const target = existingDrafts.find((entry) => entry.id === id); if (target) void runDraftAction(() => persistDraft({ ...target, draftText: text }), `Saved ${PUBLISHING_CHANNEL_CONFIG[target.channel].label} draft.`) }} onApprove={canApprove ? (id) => { void runDraftAction(() => approveDraft(id), 'Draft approved and recorded as a Revision.') } : undefined} onRegenerate={(id) => { if (!selectedSeed) return; const target = existingDrafts.find((entry) => entry.id === id); if (target) void runDraftAction(() => persistDraft({ ...target, draftText: resetTemplateDraft(target, selectedSeed) }), 'Reset and saved the source template.') }} onSchedule={canManageQueue ? (id, scheduledAt) => { void runDraftAction(() => scheduleDraft(id, scheduledAt), 'Scheduled. Track it from the Queue.') } : undefined} />)}</div></section>)}
          </div>
        )}
      </section>
    </div>
  )
}
