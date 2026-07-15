'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { formatBytes, inferAssetType, normalizeTags } from '@/lib/seeds/input'
import { useApp } from '@/lib/app/app-provider'
import {
  CORE_PUBLISHING_CHANNELS,
  type AssetType,
  type PublishingChannel,
  type SeedKind,
  type SeedStatus,
} from '@/lib/domain/types'
import { evaluateSeedReadiness, type SeedReadinessField } from '@/lib/seeds/readiness'

type PendingAsset = {
  id: string
  file: File
  name: string
  size: number
  type: AssetType
  previewUrl?: string
}

const READINESS_LABELS: Record<SeedReadinessField, string> = {
  title: 'Working title',
  source: 'Source text or file',
  goal: 'Purpose',
  audience: 'Audience (Seed or Brand Profile)',
  brand_profile: 'Brand Profile',
  target_channels: 'At least one channel',
}

function normalizeLines(value: string): string[] {
  return Array.from(new Set(value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)))
}

export default function NewSeedPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const assetsRef = useRef<PendingAsset[]>([])
  const { brandProfiles, createSeedItem, currentWorkspace, defaultBrandProfile } = useApp()

  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [kind, setKind] = useState<SeedKind>('text')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [keyPoints, setKeyPoints] = useState('')
  const [callToAction, setCallToAction] = useState('')
  const [tags, setTags] = useState('')
  const [brandProfileId, setBrandProfileId] = useState('')
  const [targetChannels, setTargetChannels] = useState<PublishingChannel[]>([...CORE_PUBLISHING_CHANNELS])
  const [assets, setAssets] = useState<PendingAsset[]>([])
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const selectedBrandProfile = brandProfiles.find((profile) => profile.id === brandProfileId) ?? null
  const normalizedTags = useMemo(() => normalizeTags(tags), [tags])
  const normalizedKeyPoints = useMemo(() => normalizeLines(keyPoints), [keyPoints])
  const readiness = useMemo(
    () => evaluateSeedReadiness(
      { title, sourceText, goal, audience, brandProfileId, targetChannels },
      { hasAssets: assets.length > 0, brandProfile: selectedBrandProfile },
    ),
    [assets.length, audience, brandProfileId, goal, selectedBrandProfile, sourceText, targetChannels, title],
  )

  useEffect(() => {
    if (!brandProfileId && defaultBrandProfile) setBrandProfileId(defaultBrandProfile.id)
  }, [brandProfileId, defaultBrandProfile])

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  useEffect(() => () => {
    for (const asset of assetsRef.current) {
      if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl)
    }
  }, [])

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    setError('')

    const nextAssets = Array.from(files).map((file) => {
      const type = inferAssetType(file.name, file.type)
      return {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type,
        previewUrl: type === 'image' ? URL.createObjectURL(file) : undefined,
      }
    })

    setAssets((current) => [...current, ...nextAssets])
    if (!title.trim() && nextAssets[0]) {
      setTitle(nextAssets[0].name.replace(/\.[^.]+$/, ''))
    }
  }

  const removeAsset = (assetId: string) => {
    setAssets((current) => {
      const target = current.find((asset) => asset.id === assetId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return current.filter((asset) => asset.id !== assetId)
    })
  }

  const toggleChannel = (channel: PublishingChannel) => {
    setTargetChannels((current) => current.includes(channel)
      ? current.filter((entry) => entry !== channel)
      : [...current, channel])
  }

  const handleSave = async (status: SeedStatus) => {
    if (!title.trim()) {
      setError('Add a working title so this Seed remains easy to find.')
      return
    }
    if (!sourceText.trim() && assets.length === 0) {
      setError('Add source text or at least one file. The rest can stay incomplete for now.')
      return
    }
    if (!brandProfileId) {
      setError('Create or select a Brand Profile before saving this Seed.')
      return
    }
    if (status === 'ready' && !readiness.isReady) {
      setError('This Seed is not ready yet. Complete the items in the readiness panel or save it as captured.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const seed = await createSeedItem({
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
        assets: assets.map((asset) => ({ file: asset.file })),
      })
      router.push(`/app/seeds/${seed.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this Seed.')
    } finally {
      setIsSaving(false)
    }
  }

  if (brandProfiles.length === 0) {
    return (
      <div>
        <PageHeader title="New Seed" description="Capture one source and shape it for every channel later." />
        <EmptyState
          title="Create your Brand Profile first"
          description="A Seed keeps raw source material separate from your reusable voice, audience, and wording rules."
          action={<Link href="/app/brand" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">Set up Brand Profile</Link>}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="New Seed"
        description="Add the raw idea, recording, image, or note once. Channel-specific proposals come after review."
        actions={<Link href="/app/seeds" className="text-sm text-gray-500 hover:text-gray-700">Cancel</Link>}
      />

      {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">1 · Source</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">What do you want to say?</h2>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Working title</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A name for this Seed" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Raw source text</label>
                <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={8} placeholder="Paste a rough note, transcript, announcement, lyrics context, or anything that must stay true…" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <p className="mt-2 text-xs text-gray-400">Rough is fine. PR2 will propose missing context without overwriting this source.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Seed kind</label>
                  <select value={kind} onChange={(event) => setKind(event.target.value as SeedKind)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="music">Music / audio</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Brand Profile</label>
                  <select value={brandProfileId} onChange={(event) => setBrandProfileId(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    {brandProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">2 · Context</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Give the editor useful boundaries</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Purpose</label>
                <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="What should this achieve?" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Audience override</label>
                <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder={selectedBrandProfile?.audience || 'Uses the Brand Profile when blank'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Key points</label>
                <textarea value={keyPoints} onChange={(event) => setKeyPoints(event.target.value)} rows={5} placeholder={'One fact per line\nDates, names, links, or details that must stay exact'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Call to action override</label>
                <textarea value={callToAction} onChange={(event) => setCallToAction(event.target.value)} rows={5} placeholder={selectedBrandProfile?.defaultCallToAction || 'Optional; uses the Brand Profile when blank'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Tags</label>
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="release, behind-the-scenes" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">3 · Channels</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Where should proposals be prepared?</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CORE_PUBLISHING_CHANNELS.map((channel) => {
                const config = PUBLISHING_CHANNEL_CONFIG[channel]
                const selected = targetChannels.includes(channel)
                return (
                  <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-violet-300 bg-violet-50' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <ChannelBadge channel={channel} />
                      <span className={`h-3 w-3 rounded-full ${selected ? 'bg-violet-500' : 'bg-stone-200'}`} />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-gray-500">{config.description}</p>
                    {channel === 'note' && <p className="mt-1 text-[11px] font-medium text-emerald-700">Review + copy only</p>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Files</h2>
                <p className="mt-1 text-sm text-gray-500">Images, video, audio, or reference documents stay private.</p>
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-stone-50">Add files</button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { handleFiles(event.target.files); event.currentTarget.value = '' }} />
            </div>
            {assets.length > 0 && (
              <div className="mt-4 space-y-3">
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-3">
                    {asset.previewUrl ? <div className="h-12 w-12 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${asset.previewUrl})` }} /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">📎</div>}
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-900">{asset.name}</p><p className="text-xs text-gray-500">{asset.type} · {formatBytes(asset.size)}</p></div>
                    <button type="button" onClick={() => removeAsset(asset.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Seed readiness</h2>
              <span className="text-2xl font-semibold text-violet-700">{readiness.score}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${readiness.score}%` }} /></div>
            {readiness.missingFields.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-green-700">Ready for reviewed channel proposals.</p>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-gray-600">Still useful to add:</p>
                <ul className="mt-2 space-y-2 text-sm text-gray-500">
                  {readiness.missingFields.map((field) => <li key={field}>○ {READINESS_LABELS[field]}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-4 border-t border-stone-100 pt-4 text-xs leading-5 text-gray-400">Incomplete Seeds can be saved. The next PR will turn these gaps into visible proposals that you approve.</p>
          </div>

          <div className="rounded-[2rem] border border-violet-100 bg-violet-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Active workspace</p>
            <p className="mt-2 text-sm font-medium text-violet-950">{currentWorkspace?.name}</p>
            <p className="mt-1 text-xs leading-5 text-violet-700">Brand: {selectedBrandProfile?.name}</p>
          </div>

          <div className="flex flex-col gap-3">
            <button type="button" disabled={isSaving} onClick={() => void handleSave('ready')} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? 'Saving…' : 'Save as ready'}</button>
            <button type="button" disabled={isSaving} onClick={() => void handleSave('captured')} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60">Save captured</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
