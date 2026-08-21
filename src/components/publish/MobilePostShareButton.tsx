'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/kit'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { Asset, DraftRevision, PublishingChannel } from '@/lib/domain/types'
import {
  listAssetPublishingAssignments,
  selectAssetsForPublishingChannel,
} from '@/lib/seeds/asset-publishing'
import { formatRevisionForHandoff } from '@/lib/services/publish-handoff'
import { getWebShareMediaAssets, prepareWebShareFiles } from '@/lib/services/web-share'
import { describeWebShareFailure } from '@/lib/services/web-share-diagnostics'

interface MobilePostShareButtonProps {
  channel: PublishingChannel
  revision: DraftRevision
  assets: Asset[]
  disabled?: boolean
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
        throw new TypeError('selected media cannot be shared on this device')
      }
      shareData.files = files
    }

    await navigator.share(shareData)
  }

  const handleShare = async () => {
    setError('')
    setMessage('')
    let sharingFiles = preparedFiles ? preparedFiles.length > 0 : mediaAssets.length > 0

    try {
      if (preparedFiles) {
        await sharePrepared(preparedFiles)
        setPreparedFiles(null)
        setMessage('共有シートへ渡しました。共有先アプリ側で内容を確認して投稿してください。')
        return
      }

      if (mediaAssets.length === 0) {
        sharingFiles = false
        await sharePrepared([])
        setMessage('投稿文を共有シートへ渡しました。共有先アプリ側で内容を確認してください。')
        return
      }

      setPreparing(true)
      const assignments = await listAssetPublishingAssignments(mediaAssets.map((asset) => asset.id))
      const channelAssets = selectAssetsForPublishingChannel(mediaAssets, assignments, channel)
      sharingFiles = channelAssets.length > 0

      if (channelAssets.length === 0) {
        setPreparing(false)
        await sharePrepared([])
        setMessage(`${PUBLISHING_CHANNEL_CONFIG[channel].shortLabel}に割り当てた画像・動画はないため、投稿文だけ共有しました。`)
        return
      }

      const files = await prepareWebShareFiles(channelAssets)
      setPreparedFiles(files)
      setPreparing(false)

      // Web Share requires transient user activation. Assignment lookup and
      // signed media fetching can consume that activation on some browsers; the
      // prepared Files stay in memory so the second tap opens share immediately.
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        setMessage(`${PUBLISHING_CHANNEL_CONFIG[channel].shortLabel}用の素材を準備しました。もう一度タップすると共有シートを開きます。`)
        return
      }

      await sharePrepared(files)
      setPreparedFiles(null)
      setMessage('この媒体に割り当てた画像・動画と投稿文を共有シートへ渡しました。共有先アプリ側で内容を確認して投稿してください。')
    } catch (cause) {
      const failure = describeWebShareFailure(cause, sharingFiles)
      if (failure.code === 'abort') {
        setMessage(failure.message)
        return
      }
      setError(failure.message)
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
      {error && (
        <p className="mt-1.5 max-w-xs text-[11px] leading-4 text-rose-600">
          {error}{' '}
          <Link href="/app/share-diagnostics" className="font-medium underline underline-offset-2">
            共有診断を開く
          </Link>
        </p>
      )}
    </div>
  )
}
