'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { FileText, Image as ImageIcon, Music2, Upload, Video } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { appendSeedAssets } from '@/lib/seeds/assets'
import { assetTypeLabel, formatAssetSize, hasUsableAssetUrl } from '@/lib/presentation/asset-presenter'

const TYPE_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Music2,
  document: FileText,
} as const

export default function SeedMediaPage() {
  const params = useParams<{ id: string }>()
  const { currentWorkspace, getSeedDetail, refreshWorkspaceData } = useApp()
  const detail = getSeedDetail(params.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

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

  const handleUpload = async () => {
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
      setFeedback(`${saved.length}件の素材を追加しました。公開予定からそのまま開く・保存できます。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材を追加できませんでした。')
      setFeedback('')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="素材管理"
        description={`「${seed.title}」で使う画像・動画・音声・資料を後から追加できます。`}
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

        <Card size="container">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">現在の素材</h2>
              <p className="mt-1 text-sm text-gray-500">公開予定にも同じ素材が自動表示されます。</p>
            </div>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">{assets.length}</span>
          </div>

          {assets.length === 0 ? (
            <p className="mt-5 rounded-xl bg-stone-50 px-4 py-4 text-sm text-gray-500">まだ素材はありません。左から追加できます。</p>
          ) : (
            <div className="mt-5 space-y-3">
              {assets.map((asset) => {
                const Icon = TYPE_ICON[asset.type]
                const usable = hasUsableAssetUrl(asset)
                return (
                  <div key={asset.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-stone-200 p-3">
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
                      <p className="mt-0.5 text-xs text-gray-400">{assetTypeLabel(asset.type)} · {formatAssetSize(asset.size)}</p>
                    </div>
                    {usable && (
                      <a href={asset.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-violet-700 hover:text-violet-800">開く</a>
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
