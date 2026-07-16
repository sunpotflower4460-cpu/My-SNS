'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import PlatformBadge from '@/components/ui/PlatformBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import { describeAuditLog, getAuditLogMeta } from '@/lib/audit/presenter'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { formatBytes, normalizeTags } from '@/lib/seeds/input'
import { useApp } from '@/lib/app/app-provider'
import {
  CORE_PUBLISHING_CHANNELS,
  type PublishingChannel,
  type SeedKind,
  type SeedStatus,
} from '@/lib/domain/types'
import { evaluateSeedReadiness } from '@/lib/seeds/readiness'

function normalizeLines(value: string): string[] {
  return Array.from(new Set(value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)))
}

export default function SeedDetailPage() {
  const params = useParams<{ id: string }>()
  const { brandProfiles, currentWorkspace, getSeedDetail, updateSeedItem } = useApp()
  const detail = getSeedDetail(params.id)

  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [kind, setKind] = useState<SeedKind>('text')
  const [status, setStatus] = useState<SeedStatus>('captured')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [keyPoints, setKeyPoints] = useState('')
  const [callToAction, setCallToAction] = useState('')
  const [targetChannels, setTargetChannels] = useState<PublishingChannel[]>([])
  const [brandProfileId, setBrandProfileId] = useState('')
  const [tags, setTags] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!detail.seed) return
    setTitle(detail.seed.title)
    setSourceText(detail.seed.sourceText ?? '')
    setKind(detail.seed.kind)
    setStatus(detail.seed.status)
    setGoal(detail.seed.goal ?? '')
    setAudience(detail.seed.audience ?? '')
    setKeyPoints(detail.seed.keyPoints.join('\n'))
    setCallToAction(detail.seed.callToAction ?? '')
    setTargetChannels(detail.seed.targetChannels)
    setBrandProfileId(detail.seed.brandProfileId ?? '')
    setTags(detail.seed.tags.join(', '))
  }, [detail.seed])

  const selectedBrandProfile = brandProfiles.find((profile) => profile.id === brandProfileId) ?? null
  const normalizedTags = useMemo(() => normalizeTags(tags), [tags])
  const normalizedKeyPoints = useMemo(() => normalizeLines(keyPoints), [keyPoints])
  const readiness = useMemo(
    () => evaluateSeedReadiness(
      { title, sourceText, goal, audience, brandProfileId, targetChannels },
      { hasAssets: detail.assets.length > 0, brandProfile: selectedBrandProfile },
    ),
    [audience, brandProfileId, detail.assets.length, goal, selectedBrandProfile, sourceText, targetChannels, title],
  )

  if (!detail.seed) {
    return (
      <div>
        <PageHeader title="Seed not found" description="This Seed is missing from the active workspace." />
        <EmptyState title="No Seed found" description="Try switching workspaces or return to the Seed Library." action={<Link href="/app/seeds" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">Back to Seeds</Link>} />
      </div>
    )
  }

  const { seed, assets, drafts, jobs, inboxItems, auditLogs } = detail

  const toggleChannel = (channel: PublishingChannel) => {
    setTargetChannels((current) => current.includes(channel)
      ? current.filter((entry) => entry !== channel)
      : [...current, channel])
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError('A working title is required.')
      return
    }
    if (status === 'ready' && !readiness.isReady) {
      setError('This Seed is marked ready but still has missing context. Switch it to captured or complete the readiness items.')
      return
    }

    setIsSaving(true)
    try {
      await updateSeedItem(seed.id, {
        title,
        sourceText,
        kind,
        status,
        goal,
        audience,
        keyPoints: normalizedKeyPoints,
        callToAction,
        targetChannels,
        brandProfileId,
        tags: normalizedTags,
      })
      setFeedback('Seed saved to this workspace.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this Seed.')
      setFeedback('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={seed.title}
        description={`${seed.kind} Seed · ${currentWorkspace?.name ?? 'Current workspace'}`}
        actions={<div className="flex items-center gap-2"><Link href="/app/seeds" className="text-sm text-gray-500 hover:text-gray-700">← Back</Link><StatusBadge status={seed.status} /></div>}
      />

      {(feedback || error) && <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>{error || feedback}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">Source of truth</p><h2 className="mt-1 text-lg font-semibold text-gray-900">Seed details</h2></div>
              <span className="text-xs text-gray-400">Channel drafts never overwrite this input.</span>
            </div>
            <div className="grid gap-4">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Working title</label><input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Raw source text</label><textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={8} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label className="mb-2 block text-sm font-medium text-gray-700">Kind</label><select value={kind} onChange={(event) => setKind(event.target.value as SeedKind)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"><option value="text">Text</option><option value="image">Image</option><option value="video">Video</option><option value="music">Music / audio</option><option value="mixed">Mixed</option></select></div>
                <div><label className="mb-2 block text-sm font-medium text-gray-700">Status</label><select value={status} onChange={(event) => setStatus(event.target.value as SeedStatus)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"><option value="captured">Captured</option><option value="ready">Ready</option><option value="archived">Archived</option></select></div>
                <div><label className="mb-2 block text-sm font-medium text-gray-700">Brand Profile</label><select value={brandProfileId} onChange={(event) => setBrandProfileId(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">{brandProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Editorial context</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Purpose</label><input value={goal} onChange={(event) => setGoal(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Audience override</label><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder={selectedBrandProfile?.audience || 'Uses Brand Profile'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Key points</label><textarea value={keyPoints} onChange={(event) => setKeyPoints(event.target.value)} rows={5} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Call to action override</label><textarea value={callToAction} onChange={(event) => setCallToAction(event.target.value)} rows={5} placeholder={selectedBrandProfile?.defaultCallToAction || 'Optional'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6" /></div>
            </div>
            <div className="mt-4"><label className="mb-2 block text-sm font-medium text-gray-700">Tags</label><input value={tags} onChange={(event) => setTags(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm" /></div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Target channels</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {CORE_PUBLISHING_CHANNELS.map((channel) => {
                const selected = targetChannels.includes(channel)
                return <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-2xl border p-4 text-left ${selected ? 'border-violet-300 bg-violet-50' : 'border-stone-200 bg-white'}`}><div className="flex items-center justify-between gap-3"><ChannelBadge channel={channel} /><span className={`h-3 w-3 rounded-full ${selected ? 'bg-violet-500' : 'bg-stone-200'}`} /></div><p className="mt-2 text-xs leading-5 text-gray-500">{PUBLISHING_CHANNEL_CONFIG[channel].description}</p></button>
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900">Attached assets</h2><span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">{assets.length}</span></div>
            {assets.length === 0 ? <p className="text-sm text-gray-500">No files attached.</p> : <div className="space-y-3">{assets.map((asset) => <div key={asset.id} className="flex items-center gap-4 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">{asset.type === 'image' && asset.url ? <div aria-label={asset.name} className="h-14 w-14 rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url(${asset.url})` }} /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl">📎</div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-900">{asset.name}</p><p className="text-xs text-gray-500">{asset.type} · {formatBytes(asset.size)}</p></div>{asset.url && <a href={asset.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-violet-700">Open</a>}</div>)}</div>}
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900">Related channel drafts</h2><Link href={`/app/drafts?seed=${seed.id}`} className="text-xs font-medium text-violet-700">Open Draft Studio →</Link></div>
            {drafts.length === 0 ? <p className="text-sm text-gray-500">No drafts saved for this Seed yet.</p> : <div className="space-y-3">{drafts.map((draft) => <div key={draft.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4"><div className="mb-2 flex items-center gap-2"><ChannelBadge channel={draft.channel} /><StatusBadge status={draft.status} /></div><p className="text-sm leading-6 text-gray-600">{draft.draftText}</p></div>)}</div>}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900">Readiness</h2><span className="text-2xl font-semibold text-violet-700">{readiness.score}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-violet-500" style={{ width: `${readiness.score}%` }} /></div>
            <p className="mt-4 text-sm leading-6 text-gray-500">{readiness.isReady ? 'Ready for reviewed channel proposals.' : `${readiness.missingFields.length} context item(s) remain. Keep captured or complete them before marking ready.`}</p>
            <button onClick={() => void handleSave()} disabled={isSaving} className="mt-5 w-full rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{isSaving ? 'Saving…' : 'Save changes'}</button>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Brand boundary</h2>
            <p className="text-sm font-medium text-gray-800">{selectedBrandProfile?.name ?? 'Missing Brand Profile'}</p>
            <p className="mt-2 text-sm leading-6 text-gray-500">{selectedBrandProfile?.description || 'Add the reusable voice and values before AI proposals.'}</p>
            <Link href="/app/brand" className="mt-4 inline-block text-xs font-medium text-violet-700">Edit Brand Profile →</Link>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Queue snippets</h2>
            {jobs.length === 0 ? <p className="text-sm text-gray-500">No jobs queued from this Seed.</p> : <div className="space-y-3">{jobs.map((job) => <div key={job.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4"><div className="mb-2 flex items-center gap-2"><ChannelBadge channel={job.channel} /><StatusBadge status={job.status} /></div><p className="text-xs text-gray-500">{job.scheduledAt ? `Scheduled ${new Date(job.scheduledAt).toLocaleString()}` : 'Awaiting scheduling'}</p></div>)}</div>}
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Inbox reactions</h2>
            {inboxItems.length === 0 ? <p className="text-sm text-gray-500">No related inbox activity yet.</p> : <div className="space-y-3">{inboxItems.map((item) => <div key={item.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4"><div className="mb-2"><PlatformBadge platform={item.platform} /></div><p className="text-sm font-medium text-gray-900">{item.authorHandle}</p><p className="mt-1 text-sm leading-6 text-gray-600">{item.text}</p></div>)}</div>}
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Recent audit trail</h2>
            {auditLogs.length === 0 ? <p className="text-sm text-gray-500">No log entries yet.</p> : <div className="space-y-3">{auditLogs.map((log) => <div key={log.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4"><p className="text-sm leading-6 text-gray-700">{describeAuditLog(log)}</p><p className="mt-1 text-xs text-gray-400">{getAuditLogMeta(log)}</p></div>)}</div>}
          </div>
        </aside>
      </div>
    </div>
  )
}
