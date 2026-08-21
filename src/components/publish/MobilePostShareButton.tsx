'use client'

import { useEffect, useMemo, useState } from 'react'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/kit'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { Asset, DraftRevision, PublishingChannel } from '@/lib/domain/types'
import { formatRevisionForHandoff } from '@/lib/services/publish-handoff'
import { getWebShareMediaAssets, prepareWebShareFiles } from '@/lib/services/web-share'

interface MobilePostShareButtonProps {
  channel: PublishingChannel
  revision: DraftRevision
  assets: Asset[]
  disabled?: boolean
}

function isShareCancellation(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

export default function MobilePostShareButton({ channel, revision, assets, disabled = false }: MobilePostShareButtonProps) {
  const [available, setAvailable] = useState(false)
  const [preparedFiles, setPreparedFiles] = useState<File[] | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const mediaAssets = useMemo(() => getWebShareMediaAssets(assets), [assets])
  const mediaKey = useMemo(() => mediaAssets.map((asset) => `${asset.id}:${asset.url}`).join('|'), [mediaAssets])
  const text = useMemo(() => formatRevisionForHandoff(revision, channel), [channel, revision])

  useEffect(() => {
    setAvailable(window.isSecureContext && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    setPreparedFiles(null)
    setMessage('')
    setError('')
  }, [mediaKey, revision.id, channel])

  if (!available) return null

  const sharePrepared = async (files: File[]) => {
    const shareData: ShareData = {
      title: revision.title?.trim() || `${PUBLISHING_CHANNEL_CONFIG[channel].shortLabel}投稿`,
      text,
    }

    if (files.length > 0) {
      if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files })) {
        throw new Error('この端末では、この画像・動画を共有シートへ直接渡せません。下の「開く・保存」を使って投稿してください。')
      }
      shareData.files = files
    }

    await navigator.share(shareData)
  }

  const handleShare = async () => {
    setError('')
    setMessage('')

    try {
      if (preparedFiles) {
        await sharePrepared(preparedFiles)
        setMessage('共有シートへ渡しました。共有先アプリ側で内容を確認して投稿してください。')
        return
      }

      if (mediaAssets.length === 0) {
        await sharePrepared([])
        setMessage('投稿文を共有シートへ渡しました。共有先アプリ側で内容を確認してください。')
        return
      }

      setPreparing(true)
      const files = await prepareWebShareFiles(assets)
      setPreparedFiles(files)
      setPreparing(false)

      // Web Share requires transient user activation. Some mobile browsers keep
      // activation while the signed media fetch finishes; others do not. If it
      // has expired, retain the prepared Files and make the second tap call
      // navigator.share() immediately, which is reliable and still avoids the
      // old save-each-file + reopen-app workflow.
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        setMessage('素材の準備ができました。もう一度タップすると共有シートを開きます。')
        return
      }

      await sharePrepared(files)
      setMessage('画像・動画と投稿文を共有シートへ渡しました。共有先アプリ側で内容を確認して投稿してください。')
    } catch (cause) {
      if (isShareCancellation(cause)) {
        setMessage('共有をキャンセルしました。素材は準備済みなので、必要ならもう一度タップできます。')
        return
      }

      setError(cause instanceof Error ? cause.message : '共有シートを開けませんでした。従来の投稿ボタンをご利用ください。')
    } finally {
      setPreparing(false)
    }
  }

  const label = preparing
    ? '共有準備中…'
    : preparedFiles
      ? '共有シートを開く'
      : mediaAssets.length > 0
        ? 'スマホで共有'
        : '投稿文を共有'

  return (
    <div className="min-w-0">
      <Button size="sm" variant="secondary" onClick={() => void handleShare()} disabled={disabled || preparing}>
        <Share2 aria-hidden className="h-3.5 w-3.5" />
        {label}
      </Button>
      {message && <p className="mt-1.5 max-w-xs text-[11px] leading-4 text-emerald-700">{message}</p>}
      {error && <p className="mt-1.5 max-w-xs text-[11px] leading-4 text-rose-600">{error}</p>}
    </div>
  )
}
