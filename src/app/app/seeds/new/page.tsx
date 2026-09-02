'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MediaDropZone from '@/components/compose/MediaDropZone'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { Button, InlineAlert, StickyActionBar } from '@/components/ui/kit'
import { inferAssetType, inferSeedKindFromFiles, normalizeTags } from '@/lib/seeds/input'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import { getSeedIdFromAssetPersistenceError } from '@/lib/storage/asset-persistence-error'
import {
  CORE_PUBLISHING_CHANNELS,
  type AssetType,
  type PublishingChannel,
  type SeedKind,
  type SeedStatus,
} from '@/lib/domain/types'
import { evaluateSeedReadiness, resolveSeedGoal } from '@/lib/seeds/readiness'

type PendingAsset = {
  id: string
  file: File
  name: string
  size: number
  type: AssetType
  previewUrl?: string
}

function normalizeLines(value: string): string[] {
  return Array.from(new Set(value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)))
}

export default function NewSeedPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const assetsRef = useRef<PendingAsset[]>([])
  const { brandProfiles, createSeedItem, currentMember, defaultBrandProfile } = useApp()
  const canCreateSeeds = Boolean(currentMember && hasPermission(currentMember.role, 'create_seeds'))

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
  const [persistedSeedId, setPersistedSeedId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedBrandProfile = brandProfiles.find((profile) => profile.id === brandProfileId) ?? null
  const normalizedTags = useMemo(() => normalizeTags(tags), [tags])
  const normalizedKeyPoints = useMemo(() => normalizeLines(keyPoints), [keyPoints])
  const inferredKind = useMemo(
    () => inferSeedKindFromFiles(assets.map((asset) => asset.type), Boolean(sourceText.trim())),
    [assets, sourceText],
  )

  useEffect(() => {
    if (!brandProfileId && defaultBrandProfile) setBrandProfileId(defaultBrandProfile.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react when the default profile id appears/changes
  }, [brandProfileId, defaultBrandProfile?.id])

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

  const handleSave = async (status: SeedStatus, next: 'detail' | 'drafts-autogen' = 'detail') => {
    if (!canCreateSeeds) {
      setError('あなたの役割ではシードを作成できません。')
      return
    }
    if (persistedSeedId) {
      setError('このシード本体はすでに保存されています。重複作成を避けるため、保存済みシードの素材画面から続きを行ってください。')
      return
    }
    if (!title.trim()) {
      setError('後で見つけやすいように、タイトルを入力してください。ファイルを入れると名前から自動で入ります。')
      return
    }
    if (!sourceText.trim() && assets.length === 0) {
      setError('写真・動画か、ひとことを少なくとも1つ入れてください。')
      return
    }
    if (!brandProfileId) {
      setError('このシードを保存する前に、ブランドプロフィールを作成または選択してください。')
      return
    }

    const resolvedGoal = resolveSeedGoal({ goal }, selectedBrandProfile)
    const nextReadiness = evaluateSeedReadiness(
      { title, sourceText, goal: resolvedGoal, audience, brandProfileId, targetChannels },
      { hasAssets: assets.length > 0, brandProfile: selectedBrandProfile },
    )
    if (status === 'ready' && !nextReadiness.isReady) {
      setError('まだ足りない項目があります。下の「くわしく書く」を開くか、取り込み済みとして保存してください。')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const seed = await createSeedItem({
        title,
        sourceText,
        kind: kind === 'text' ? inferredKind : kind,
        status,
        goal: resolvedGoal,
        audience,
        keyPoints: normalizedKeyPoints,
        callToAction,
        targetChannels,
        brandProfileId,
        tags: normalizedTags,
        assets: assets.map((asset) => ({ file: asset.file })),
      })
      router.push(next === 'drafts-autogen' ? `/app/drafts?seed=${seed.id}&autogen=1` : `/app/seeds/${seed.id}`)
    } catch (cause) {
      const savedSeedId = getSeedIdFromAssetPersistenceError(cause)
      if (savedSeedId) {
        setPersistedSeedId(savedSeedId)
        setError('シード本体は保存できましたが、一部の素材を保存できませんでした。新しいシードを作り直さず、保存済みシードの素材画面から不足しているファイルだけ追加してください。')
      } else {
        setError(cause instanceof Error ? cause.message : 'このシードを保存できませんでした。')
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (brandProfiles.length === 0) {
    return (
      <div>
        <PageHeader title="新しい発信" description="写真や動画を入れて、各媒体向けの提案をもらいます。" />
        <EmptyState
          title="先にブランドプロフィールを作成してください"
          description="シードは、繰り返し使う声のトーン・対象読者・表記ルールと、生の素材とを切り分けて保持します。"
          action={<Link href="/app/brand" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">ブランドプロフィールを設定</Link>}
        />
      </div>
    )
  }

  return (
    <div className="pb-24 xl:pb-0">
      <PageHeader
        title="新しい発信"
        description="写真や動画を入れて、最低限書いたら提案が出ます。直して、まとめて送れます。"
        actions={<Link href="/app/seeds" className="text-sm font-medium text-[color:var(--text-muted)] transition hover:text-[color:var(--text-strong)]">キャンセル</Link>}
      />

      {error && (
        <div className="mb-5">
          <InlineAlert tone="error">
            <p>{error}</p>
            {persistedSeedId && (
              <Link
                href={`/app/seeds/${persistedSeedId}/media`}
                className="mt-3 inline-flex rounded-full bg-red-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-800"
              >
                保存済みシードの素材を確認
              </Link>
            )}
          </InlineAlert>
        </div>
      )}

      <div className="space-y-5">
        <section className="ui-panel rounded-container p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[color:var(--accent)]">1・素材</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[color:var(--text-strong)]">何を届けますか？</h2>
          <div className="mt-4">
            <MediaDropZone
              assets={assets}
              onAddFiles={handleFiles}
              onRemove={removeAsset}
              inputRef={fileInputRef}
              disabled={!canCreateSeeds || Boolean(persistedSeedId)}
            />
          </div>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">タイトル</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="この発信の名前" className="ui-input w-full rounded-card px-4 py-3 text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">ひとこと</span>
              <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={4} placeholder="伝えたいことをラフに。素材だけでも保存できます。" className="ui-input w-full rounded-card px-4 py-3 text-sm leading-6 focus:outline-none" />
            </label>
          </div>
        </section>

        <section className="ui-panel rounded-container p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[color:var(--accent)]">2・送り先</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[color:var(--text-strong)]">どの媒体に出しますか？</h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">あとから外せます。とりあえず全部でも構いません。</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {CORE_PUBLISHING_CHANNELS.map((channel) => {
              const selected = targetChannels.includes(channel)
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  className={`rounded-card border p-3 text-left transition duration-200 ease-[var(--ease-out-premium)] ${selected ? 'border-[color:rgba(109,93,246,0.22)] bg-[color:var(--accent-soft)]' : 'border-[color:var(--border-default)] bg-white/76'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <ChannelBadge channel={channel} />
                    <span className={`h-3 w-3 rounded-full ${selected ? 'bg-[color:var(--accent)]' : 'bg-black/10'}`} />
                  </div>
                  {channel === 'note' && <p className="mt-2 text-[11px] font-medium text-emerald-700">コピーして投稿</p>}
                </button>
              )
            })}
          </div>
        </section>

        <details className="ui-panel rounded-container p-5">
          <summary className="cursor-pointer text-sm font-semibold text-[color:var(--text-strong)]">くわしく書く（任意）</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {brandProfiles.length > 1 && (
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">ブランドプロフィール</span>
                <select value={brandProfileId} onChange={(event) => setBrandProfileId(event.target.value)} className="ui-input w-full rounded-card px-4 py-3 text-sm focus:outline-none">
                  {brandProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">目的</span>
              <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder={selectedBrandProfile?.description || '未入力ならブランドの説明を使います'} className="ui-input w-full rounded-card px-4 py-3 text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">対象</span>
              <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder={selectedBrandProfile?.audience || '未入力ならブランドの対象を使います'} className="ui-input w-full rounded-card px-4 py-3 text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">要点</span>
              <textarea value={keyPoints} onChange={(event) => setKeyPoints(event.target.value)} rows={4} placeholder={'1行につき1つの事実'} className="ui-input w-full rounded-card px-4 py-3 text-sm leading-6 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">CTA</span>
              <textarea value={callToAction} onChange={(event) => setCallToAction(event.target.value)} rows={4} placeholder={selectedBrandProfile?.defaultCallToAction || '任意'} className="ui-input w-full rounded-card px-4 py-3 text-sm leading-6 focus:outline-none" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">タグ</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="リリース, 制作の裏側" className="ui-input w-full rounded-card px-4 py-3 text-sm focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[color:var(--text-strong)]">種類</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as SeedKind)} className="ui-input w-full rounded-card px-4 py-3 text-sm focus:outline-none">
                <option value="text">テキスト（自動判定も可）</option>
                <option value="image">画像</option>
                <option value="video">動画</option>
                <option value="music">音楽 / 音声</option>
                <option value="mixed">複合</option>
              </select>
              <p className="mt-1 text-[11px] text-[color:var(--text-subtle)]">未変更のままなら、入れたファイルから自動で判定します。</p>
            </label>
          </div>
        </details>
      </div>

      <StickyActionBar>
        <Button
          variant="secondary"
          disabled={!canCreateSeeds || isSaving || Boolean(persistedSeedId)}
          onClick={() => void handleSave('captured')}
        >
          保存だけ
        </Button>
        <Button
          variant="primary"
          disabled={!canCreateSeeds || isSaving || Boolean(persistedSeedId)}
          loading={isSaving}
          onClick={() => {
            const resolvedGoal = resolveSeedGoal({ goal }, selectedBrandProfile)
            const nextReadiness = evaluateSeedReadiness(
              { title, sourceText, goal: resolvedGoal, audience, brandProfileId, targetChannels },
              { hasAssets: assets.length > 0, brandProfile: selectedBrandProfile },
            )
            void handleSave(
              nextReadiness.isReady ? 'ready' : 'captured',
              'drafts-autogen',
            )
          }}
        >
          提案をもらう
        </Button>
      </StickyActionBar>
    </div>
  )
}
