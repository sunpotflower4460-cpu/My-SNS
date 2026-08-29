'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { FileText, Image as ImageIcon, Music2, Trash2, Upload, Video } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { Asset, AssetMediaRole, PublishingChannel } from '@/lib/domain/types'
import { appendSeedAssets, deleteSeedAsset } from '@/lib/seeds/assets'
import {
  listSeedAssetPublishingAssignments,
  updateSeedAssetMediaAttributes,
  updateSeedAssetPublishingChannels,
  type AssetPublishingAssignments,
} from '@/lib/seeds/asset-publishing'
import { hasPermission } from '@/lib/permissions'
import { assetMediaRoleLabel, assetTypeLabel, formatAssetSize, hasUsableAssetUrl } from '@/lib/presentation/asset-presenter'
import { aspectLabel } from '@/lib/media/aspect'
import { captureVideoStill, centerCropForAspect, exportCroppedImage, exportCroppedVideo } from '@/lib/media/crop'
import { generatePerformanceThumbnailsForSeed } from '@/lib/media/thumbnail-pipeline'

const TYPE_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Music2,
  document: FileText,
} as const

type AssignmentLoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function SeedMediaPage() {
  const params = useParams<{ id: string }>()
  const { currentMember, currentWorkspace, getSeedDetail, refreshWorkspaceData } = useApp()
  const detail = getSeedDetail(params.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [savingAssignmentAssetId, setSavingAssignmentAssetId] = useState<string | null>(null)
  const [variantBusyAssetId, setVariantBusyAssetId] = useState<string | null>(null)
  const [publishingAssignments, setPublishingAssignments] = useState<AssetPublishingAssignments>({})
  const [assignmentLoadState, setAssignmentLoadState] = useState<AssignmentLoadState>('idle')
  const [assignmentLoadError, setAssignmentLoadError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const seedId = detail.seed?.id
  const assetIdsKey = detail.assets.map((asset) => asset.id).join('|')
  const autoThumbAttemptedRef = useRef(false)
  const canUploadAssetsEarly = Boolean(currentMember && hasPermission(currentMember.role, 'upload_assets'))

  useEffect(() => {
    let active = true

    if (!currentWorkspace || !seedId) {
      setPublishingAssignments({})
      setAssignmentLoadState('idle')
      setAssignmentLoadError('')
      return () => { active = false }
    }

    const assetIds = assetIdsKey ? assetIdsKey.split('|') : []
    setPublishingAssignments({})
    setAssignmentLoadState('loading')
    setAssignmentLoadError('')

    void listSeedAssetPublishingAssignments({
      workspaceId: currentWorkspace.id,
      seedId,
      assetIds,
    }).then((assignments) => {
      if (!active) return
      setPublishingAssignments(assignments)
      setAssignmentLoadState('ready')
    }).catch((cause) => {
      if (!active) return
      setPublishingAssignments({})
      setAssignmentLoadState('error')
      setAssignmentLoadError(cause instanceof Error ? cause.message : '素材の投稿先設定を読み込めませんでした。')
    })

    return () => { active = false }
  }, [assetIdsKey, currentWorkspace, seedId])

  useEffect(() => {
    if (!currentWorkspace || !detail.seed) return
    if (!canUploadAssetsEarly) return
    if (assignmentLoadState !== 'ready') return
    if (autoThumbAttemptedRef.current) return
    const hasVideo = detail.assets.some((asset) => asset.type === 'video' && Boolean(asset.url))
    if (!hasVideo) return
    autoThumbAttemptedRef.current = true

    void generatePerformanceThumbnailsForSeed({
      workspaceId: currentWorkspace.id,
      seedId: detail.seed.id,
      seedTitle: detail.seed.title,
      assets: detail.assets,
      drafts: [],
    }).then(async (result) => {
      if (result.assets.length > 0) {
        await refreshWorkspaceData()
        setFeedback(result.message)
        setError('')
      } else if (!result.ok) {
        setError(result.message)
      }
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : '文字入りサムネイルの作成に失敗しました。PNG/JPGをアップロードしてください。')
    })
    // assetIdsKey stands in for detail.assets identity so this effect does not loop on a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [assignmentLoadState, assetIdsKey, canUploadAssetsEarly, currentWorkspace, detail.seed, refreshWorkspaceData])

  if (!detail.seed || !currentWorkspace) {
    return (
      <div>
        <PageHeader title="素材管理" description="対象のSeedが見つかりません。" />
        <EmptyState
          title="Seedが見つかりません"
          description="ワークスペースを確認してSeed一覧へ戻ってください。"
          action={<Link href="/app/seeds" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">Seed一覧へ</Link>}
        />
      </div>
    )
  }

  const { seed, assets } = detail
  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0)
  const canUploadAssets = Boolean(currentMember && hasPermission(currentMember.role, 'upload_assets'))
  const canDeleteAssets = Boolean(currentMember && hasPermission(currentMember.role, 'delete_assets'))
  const canAssignAssets = canUploadAssets && assignmentLoadState === 'ready'

  const handleUpload = async () => {
    if (!canUploadAssets) {
      setError('あなたの役割では素材を追加できません。')
      setFeedback('')
      return
    }
    if (selectedFiles.length === 0) {
      setError('追加するファイルを選んでください。')
      setFeedback('')
      return
    }

    setUploading(true)
    try {
      const saved = await appendSeedAssets({
        workspaceId: currentWorkspace.id,
        seedId: seed.id,
        files: selectedFiles,
      })
      await refreshWorkspaceData()
      setSelectedFiles([])
      if (inputRef.current) inputRef.current.value = ''
      autoThumbAttemptedRef.current = false
      setFeedback(`${saved.length}件の素材を追加しました。動画があれば文字入りサムネイルを自動作成します。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材を追加できませんでした。')
      setFeedback('')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (assetId: string, assetName: string) => {
    if (!canDeleteAssets) return
    const confirmed = window.confirm(`「${assetName}」をこのSeedと非公開ストレージから削除しますか？`)
    if (!confirmed) return

    setDeletingAssetId(assetId)
    try {
      await deleteSeedAsset({
        workspaceId: currentWorkspace.id,
        seedId: seed.id,
        assetId,
      })
      await refreshWorkspaceData()
      setPublishingAssignments((current) => {
        const next = { ...current }
        delete next[assetId]
        return next
      })
      setFeedback(`「${assetName}」を削除しました。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材を削除できませんでした。')
      setFeedback('')
    } finally {
      setDeletingAssetId(null)
    }
  }

  const handleAssignmentChange = async (assetId: string, assetName: string, channels: PublishingChannel[]) => {
    if (!canAssignAssets) return

    setSavingAssignmentAssetId(assetId)
    try {
      await updateSeedAssetPublishingChannels({ assetId, channels })
      setPublishingAssignments((current) => ({ ...current, [assetId]: channels }))
      setFeedback(
        channels.length === 0
          ? `「${assetName}」をすべての投稿先で使う設定にしました。`
          : `「${assetName}」の投稿先を更新しました。`,
      )
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材の投稿先を保存できませんでした。')
      setFeedback('')
    } finally {
      setSavingAssignmentAssetId(null)
    }
  }

  const toggleChannel = (assignedChannels: PublishingChannel[], channel: PublishingChannel): PublishingChannel[] => {
    if (assignedChannels.length === 0) return [channel]
    if (assignedChannels.includes(channel)) return assignedChannels.filter((entry) => entry !== channel)
    return [...assignedChannels, channel]
  }

  const fileFromAsset = async (asset: Asset): Promise<File> => {
    const response = await fetch(asset.url)
    if (!response.ok) throw new Error('素材ファイルを取得できませんでした。')
    const blob = await response.blob()
    return new File([blob], asset.name, { type: blob.type || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') })
  }

  const handleVariantExport = async (asset: Asset, kind: '16:9' | '9:16' | 'still') => {
    if (!canUploadAssets) return
    setVariantBusyAssetId(asset.id)
    try {
      const source = await fileFromAsset(asset)
      if (kind === 'still') {
        const blob = asset.type === 'video'
          ? await captureVideoStill(source)
          : await exportCroppedImage(source, centerCropForAspect(1, 1, 16 / 9))
        const file = new File([blob], `${asset.name.replace(/\.[^.]+$/, '')}-thumb.jpg`, { type: 'image/jpeg' })
        await appendSeedAssets({
          workspaceId: currentWorkspace.id,
          seedId: seed.id,
          files: [file],
          mediaRole: 'thumbnail',
          sourceAssetId: asset.id,
          publishingChannels: ['youtube'],
          aspectRatio: '16:9',
        })
      } else {
        const targetAspect = kind === '16:9' ? 16 / 9 : 9 / 16
        let file: File
        if (asset.type === 'video') {
          const blob = await exportCroppedVideo(source, targetAspect)
          file = new File([blob], `${asset.name.replace(/\.[^.]+$/, '')}-${kind.replace(':', 'x')}.webm`, { type: blob.type || 'video/webm' })
        } else {
          const image = await createImageBitmap(source)
          const crop = centerCropForAspect(image.width, image.height, targetAspect)
          image.close()
          const blob = await exportCroppedImage(source, crop)
          file = new File([blob], `${asset.name.replace(/\.[^.]+$/, '')}-${kind.replace(':', 'x')}.jpg`, { type: 'image/jpeg' })
        }
        await appendSeedAssets({
          workspaceId: currentWorkspace.id,
          seedId: seed.id,
          files: [file],
          mediaRole: 'variant',
          sourceAssetId: asset.id,
          aspectRatio: kind,
        })
      }
      await refreshWorkspaceData()
      if (kind === '9:16' || kind === 'still') autoThumbAttemptedRef.current = false
      setFeedback(kind === 'still' ? 'サムネイル用の静止画を追加しました。' : `${kind}のバリアントを追加しました。ブラウザ書き出しはWebM/JPEGです。SNSが受け付けない場合は書き出したMP4/PNGを追加してください。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'バリアントを作成できませんでした。')
      setFeedback('')
    } finally {
      setVariantBusyAssetId(null)
    }
  }

  const handleRoleChange = async (asset: Asset, role: AssetMediaRole) => {
    if (!canAssignAssets) return
    setSavingAssignmentAssetId(asset.id)
    try {
      await updateSeedAssetMediaAttributes({ assetId: asset.id, mediaRole: role })
      await refreshWorkspaceData()
      setFeedback(`「${asset.name}」の役割を更新しました。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材の役割を保存できませんでした。')
      setFeedback('')
    } finally {
      setSavingAssignmentAssetId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="素材管理"
        description={`「${seed.title}」で使う画像・動画・音声・資料を後から追加・整理できます。動画を追加すると文字入りサムネイルが自動で作られます。`}
        actions={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/app/seeds/${seed.id}`} className="text-gray-500 hover:text-gray-700">Seedへ戻る</Link>
            <Link href="/app/queue" className="font-medium text-violet-700 hover:text-violet-800">公開予定へ</Link>
          </div>
        }
      />

      {feedback && <div className="mb-5"><InlineAlert tone="success">{feedback}</InlineAlert></div>}
      {error && <div className="mb-5"><InlineAlert tone="error">{error}</InlineAlert></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        {canUploadAssets ? (
          <Card size="container">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700">
                <Upload aria-hidden className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">素材を追加</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">複数ファイルをまとめて選べます。保存先は既存の非公開Supabase Storageです。</p>
              </div>
            </div>

            <label className="mt-5 block cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-7 text-center hover:border-violet-300 hover:bg-violet-50/40">
              <span className="text-sm font-medium text-gray-800">画像・動画などを選択</span>
              <span className="mt-1 block text-xs text-gray-500">画像 / 動画 / 音声 / PDFなど</span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.txt,.md"
                className="sr-only"
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
            </label>

            {selectedFiles.length > 0 && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-800">選択中 {selectedFiles.length}件</p>
                  <p className="text-xs text-gray-400">合計 {formatAssetSize(selectedBytes)}</p>
                </div>
                <div className="mt-3 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                      <span className="truncate text-gray-600">{file.name}</span>
                      <span className="shrink-0 text-gray-400">{formatAssetSize(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => void handleUpload()} disabled={uploading || selectedFiles.length === 0}>
                {uploading ? 'アップロード中…' : 'このSeedに追加'}
              </Button>
              {selectedFiles.length > 0 && (
                <Button
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => {
                    setSelectedFiles([])
                    if (inputRef.current) inputRef.current.value = ''
                  }}
                >
                  選択解除
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card size="container" tone="muted">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-stone-100 p-2.5 text-gray-500">
                <Upload aria-hidden className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">素材は閲覧のみです</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">現在の役割には素材のアップロード・投稿先変更権限がありません。既存素材の確認は右側からできます。</p>
              </div>
            </div>
          </Card>
        )}

        <Card size="container">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">現在の素材</h2>
                <p className="mt-1 text-sm text-gray-500">「全媒体」は従来どおりSeedのすべての投稿先で使います。16:9はYouTube向け、9:16はShorts / Reels / TikTok向けです。動画があると文字入りサムネイル（1280×720）を自動作成します。</p>
            </div>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">{assets.length}</span>
          </div>

          {!canDeleteAssets && assets.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-gray-400">この役割では素材の削除はできません。</p>
          )}

          {assets.length > 0 && assignmentLoadState === 'loading' && (
            <p className="mt-3 text-xs leading-5 text-gray-500">素材の投稿先設定を確認しています…</p>
          )}

          {assets.length > 0 && assignmentLoadState === 'error' && (
            <div className="mt-3">
              <InlineAlert tone="error" title="投稿先設定を確認できません">
                {assignmentLoadError} 誤った設定で上書きしないよう、投稿先の変更操作は停止しています。
              </InlineAlert>
            </div>
          )}

          {assets.length === 0 ? (
            <p className="mt-5 rounded-xl bg-stone-50 px-4 py-4 text-sm text-gray-500">
              {canUploadAssets ? 'まだ素材はありません。左から追加できます。' : 'まだ素材はありません。アップロード権限のあるメンバーが追加できます。'}
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {assets.map((asset) => {
                const Icon = TYPE_ICON[asset.type]
                const usable = hasUsableAssetUrl(asset)
                const deleting = deletingAssetId === asset.id
                const savingAssignment = savingAssignmentAssetId === asset.id
                const assignmentKnown = assignmentLoadState === 'ready'
                const assignedChannels = assignmentKnown ? publishingAssignments[asset.id] ?? [] : []
                const usesAllChannels = assignmentKnown && assignedChannels.length === 0
                const appliesToCurrentTargets = !assignmentKnown || usesAllChannels || assignedChannels.some((channel) => seed.targetChannels.includes(channel))

                return (
                  <div key={asset.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-50">
                        {asset.type === 'image' && usable ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon aria-hidden className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{asset.name}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {assetTypeLabel(asset.type)} · {assetMediaRoleLabel(asset.mediaRole)} · {aspectLabel(asset.aspectRatio)} · {formatAssetSize(asset.size)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {usable && (
                          <a href={asset.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-violet-700 hover:text-violet-800">開く</a>
                        )}
                        {canDeleteAssets && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleting}
                            onClick={() => void handleDelete(asset.id, asset.name)}
                          >
                            <Trash2 aria-hidden className="h-3.5 w-3.5" />
                            {deleting ? '削除中…' : '削除'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {(asset.type === 'image' || asset.type === 'video') && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                          役割
                          <select
                            value={asset.mediaRole ?? 'source'}
                            disabled={!canAssignAssets || savingAssignment}
                            onChange={(event) => void handleRoleChange(asset, event.target.value as AssetMediaRole)}
                            className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[11px] text-gray-700"
                          >
                            <option value="source">マスター</option>
                            <option value="variant">バリアント</option>
                            <option value="thumbnail">サムネイル</option>
                            <option value="cover">カバー</option>
                            <option value="eyecatch">アイキャッチ</option>
                          </select>
                        </label>
                        {canUploadAssets && usable && (
                          <>
                            <Button size="sm" variant="secondary" disabled={variantBusyAssetId === asset.id} onClick={() => void handleVariantExport(asset, '16:9')}>
                              16:9を切り出す
                            </Button>
                            <Button size="sm" variant="secondary" disabled={variantBusyAssetId === asset.id} onClick={() => void handleVariantExport(asset, '9:16')}>
                              9:16を切り出す
                            </Button>
                            {asset.type === 'video' && (
                              <Button size="sm" variant="secondary" disabled={variantBusyAssetId === asset.id} onClick={() => void handleVariantExport(asset, 'still')}>
                                サムネイルを切り出す
                              </Button>
                            )}
                            {variantBusyAssetId === asset.id && <span className="text-[11px] text-gray-400">書き出し中…</span>}
                          </>
                        )}
                      </div>
                    )}

                    {seed.targetChannels.length > 0 && (
                      <div className="mt-3 border-t border-stone-100 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mr-1 text-[11px] font-medium text-gray-500">この素材を使う投稿先</span>
                          <button
                            type="button"
                            aria-pressed={usesAllChannels}
                            disabled={!canAssignAssets || savingAssignment}
                            onClick={() => void handleAssignmentChange(asset.id, asset.name, [])}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${usesAllChannels ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-stone-200 bg-white text-gray-500 hover:bg-stone-50'}`}
                          >
                            全媒体
                          </button>
                          {seed.targetChannels.map((channel) => {
                            const selected = assignmentKnown && assignedChannels.includes(channel)
                            const nextChannels = toggleChannel(assignedChannels, channel)
                            return (
                              <button
                                key={channel}
                                type="button"
                                aria-pressed={selected}
                                disabled={!canAssignAssets || savingAssignment}
                                onClick={() => void handleAssignmentChange(asset.id, asset.name, nextChannels)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-stone-200 bg-white text-gray-500 hover:bg-stone-50'}`}
                              >
                                {PUBLISHING_CHANNEL_CONFIG[channel].shortLabel}
                              </button>
                            )
                          })}
                          {savingAssignment && <span className="text-[11px] text-gray-400">保存中…</span>}
                          {!assignmentKnown && assignmentLoadState === 'loading' && <span className="text-[11px] text-gray-400">確認中…</span>}
                          {!assignmentKnown && assignmentLoadState === 'error' && <span className="text-[11px] text-rose-600">設定不明</span>}
                        </div>
                        {!appliesToCurrentTargets && (
                          <p className="mt-2 text-[11px] leading-5 text-amber-700">現在のSeed投稿先には割り当てられていません。「全媒体」か使用する媒体を選んでください。</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
