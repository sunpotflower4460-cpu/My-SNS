'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, ExternalLink, FileText, Image as ImageIcon, Music2, Video } from 'lucide-react'
import type { Asset } from '@/lib/domain/types'
import { assetTypeLabel, formatAssetSize, hasUsableAssetUrl } from '@/lib/presentation/asset-presenter'
import { Button } from '@/components/ui/kit'

interface QueueMediaKitProps {
  seedId: string
  assets: Asset[]
}

const TYPE_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Music2,
  document: FileText,
} as const

async function downloadAsset(asset: Asset): Promise<void> {
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error('素材を取得できませんでした。')

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = asset.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

export default function QueueMediaKit({ seedId, assets }: QueueMediaKitProps) {
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null)
  const [errorAssetId, setErrorAssetId] = useState<string | null>(null)

  if (assets.length === 0) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-400">添付素材なし</span>
        <Link href={`/app/seeds/${seedId}/media`} className="font-medium text-violet-700 hover:text-violet-800">
          素材を追加
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-700">Seedの素材</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{assets.length}件</span>
          <Link href={`/app/seeds/${seedId}/media`} className="text-[11px] font-medium text-violet-700 hover:text-violet-800">
            投稿先を割り当て・管理
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => {
          const Icon = TYPE_ICON[asset.type]
          const usable = hasUsableAssetUrl(asset)
          const busy = busyAssetId === asset.id
          const failed = errorAssetId === asset.id

          return (
            <div key={asset.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-stone-200 bg-white p-2.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-stone-100 bg-stone-50">
                {asset.type === 'image' && usable ? (
                  // Signed Supabase URLs are ephemeral and workspace-scoped; a
                  // plain img keeps remote image hosts out of next.config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon aria-hidden className="h-5 w-5 text-gray-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-800" title={asset.name}>{asset.name}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{assetTypeLabel(asset.type)} · {formatAssetSize(asset.size)}</p>
                {failed && <p className="mt-1 text-[11px] text-rose-600">保存できませんでした。ページを更新して再試行してください。</p>}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!usable}
                    onClick={() => window.open(asset.url, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    開く
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!usable || busy}
                    onClick={() => {
                      const assetId = asset.id
                      setBusyAssetId(assetId)
                      setErrorAssetId((current) => (current === assetId ? null : current))
                      void downloadAsset(asset)
                        .catch(() => setErrorAssetId(assetId))
                        .finally(() => setBusyAssetId((current) => (current === assetId ? null : current)))
                    }}
                  >
                    <Download aria-hidden className="h-3.5 w-3.5" />
                    {busy ? '保存中…' : '保存'}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] leading-5 text-gray-400">
        「スマホで共有」は素材管理で設定した投稿先だけを自動で選びます。ここではSeed内の全素材を確認でき、「開く・保存」は共有先アプリにうまく渡らない場合の確実な代替手段です。
      </p>
    </div>
  )
}
