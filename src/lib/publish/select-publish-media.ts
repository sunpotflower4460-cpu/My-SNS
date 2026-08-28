import type { AssetAspectRatio, AssetMediaRole, AssetType, PublishingChannel } from '@/lib/domain/types'
import { parseDraftPublishOptions } from './draft-publish-options'

export interface PublishAssetCandidate {
  id: string
  storagePath: string | null
  type: AssetType
  publishingChannels: PublishingChannel[] | null
  aspectRatio: AssetAspectRatio | null
  mediaRole: AssetMediaRole
}

export interface PublishMediaSelection {
  media: PublishAssetCandidate
  mediaType: 'image' | 'video'
  thumbnail?: PublishAssetCandidate
  cover?: PublishAssetCandidate
  eyecatch?: PublishAssetCandidate
  isShort: boolean
}

export type PublishMediaResult =
  | { ok: true; selection: PublishMediaSelection }
  | { ok: true; selection: null }
  | { ok: false; message: string }

const STILL_ROLES: AssetMediaRole[] = ['thumbnail', 'cover', 'eyecatch']

function assignedToChannel(asset: PublishAssetCandidate, channel: PublishingChannel): boolean {
  const channels = asset.publishingChannels
  return !channels || channels.length === 0 || channels.includes(channel)
}

function isMainMedia(asset: PublishAssetCandidate): boolean {
  return (asset.type === 'video' || asset.type === 'image') && !STILL_ROLES.includes(asset.mediaRole)
}

function isImage(asset: PublishAssetCandidate): boolean {
  return asset.type === 'image'
}

function findById(assets: PublishAssetCandidate[], id: string | undefined): PublishAssetCandidate | undefined {
  if (!id) return undefined
  return assets.find((asset) => asset.id === id)
}

function pickStill(params: {
  assets: PublishAssetCandidate[]
  channel: PublishingChannel
  requestedId?: string
  role: AssetMediaRole
}): { asset?: PublishAssetCandidate; error?: string } {
  if (params.requestedId) {
    const requested = findById(params.assets, params.requestedId)
    if (!requested) {
      return { error: `指定された${params.role}画像（asset ${params.requestedId}）が見つかりません。` }
    }
    if (!isImage(requested)) {
      return { error: `指定された${params.role}は画像ではありません。PNG / JPG を選んでください。` }
    }
    if (!requested.storagePath) {
      return { error: `指定された${params.role}画像に保存パスがありません。` }
    }
    return { asset: requested }
  }

  const roleMatch = params.assets.find(
    (asset) => asset.mediaRole === params.role && isImage(asset) && assignedToChannel(asset, params.channel) && asset.storagePath,
  )
  return { asset: roleMatch }
}

function channelNeedsNineSixteenVideo(channel: PublishingChannel, isShort: boolean, mediaType: 'image' | 'video'): boolean {
  if (mediaType !== 'video') return false
  if (channel === 'tiktok') return true
  if (channel === 'instagram') return true
  if (channel === 'youtube' && isShort) return true
  return false
}

function preferAspect(
  candidates: PublishAssetCandidate[],
  preferred: AssetAspectRatio | null,
): PublishAssetCandidate | undefined {
  if (preferred) {
    const match = candidates.find((asset) => asset.aspectRatio === preferred)
    if (match) return match
  }
  return candidates[0]
}

/**
 * Chooses the actual files a publish attempt will send. Text ideas such as
 * thumbnailTextIdeas are ignored — only real image/video assets count.
 *
 * Returns `{ ok: true, selection: null }` when the channel has no media and
 * none is required (X text, note copy). Required-media channels fail closed.
 */
export function selectPublishMedia(params: {
  assets: PublishAssetCandidate[]
  channel: PublishingChannel
  metadata?: Record<string, unknown> | null
}): PublishMediaResult {
  const options = parseDraftPublishOptions(params.metadata)
  const channelAssets = params.assets.filter((asset) => assignedToChannel(asset, params.channel))
  const mainCandidates = channelAssets.filter(isMainMedia).filter((asset) => Boolean(asset.storagePath))

  const thumbnailPick = pickStill({
    assets: params.assets,
    channel: params.channel,
    requestedId: options.thumbnailAssetId,
    role: 'thumbnail',
  })
  if (thumbnailPick.error) return { ok: false, message: thumbnailPick.error }

  const coverPick = pickStill({
    assets: params.assets,
    channel: params.channel,
    requestedId: options.coverAssetId,
    role: 'cover',
  })
  if (coverPick.error) return { ok: false, message: coverPick.error }

  const eyecatchPick = pickStill({
    assets: params.assets,
    channel: params.channel,
    requestedId: options.eyecatchAssetId,
    role: 'eyecatch',
  })
  if (eyecatchPick.error) return { ok: false, message: eyecatchPick.error }

  if (params.channel === 'tiktok' && coverPick.asset) {
    return {
      ok: false,
      message:
        'TikTok Content Posting APIはカスタムカバー画像の添付に対応していません。カバーは動画内のフレーム指定（coverTimestampMs）のみです。カバー画像の指定を外すか、note/YouTube向けの役割に変更してください。',
    }
  }

  const videos = mainCandidates.filter((asset) => asset.type === 'video')
  const images = mainCandidates.filter((asset) => asset.type === 'image')

  const inferredShort = options.isShort === true || (
    params.channel === 'youtube' && videos.some((asset) => asset.aspectRatio === '9:16') && !videos.some((asset) => asset.aspectRatio === '16:9')
  )

  let media: PublishAssetCandidate | undefined
  if (params.channel === 'youtube' || params.channel === 'tiktok') {
    const preferredAspect: AssetAspectRatio | null = inferredShort || params.channel === 'tiktok' ? '9:16' : '16:9'
    media = preferAspect(videos, preferredAspect)
  } else if (params.channel === 'instagram') {
    media = preferAspect(videos, '9:16') ?? images[0]
  } else {
    media = videos[0] ?? images[0]
  }

  const mediaRequired = params.channel === 'youtube' || params.channel === 'tiktok' || params.channel === 'instagram'
  if (!media) {
    if (mediaRequired) {
      return {
        ok: false,
        message: `${params.channel}には動画または画像ファイルが必要です。シードの素材管理からファイルを追加してください。`,
      }
    }
    return { ok: true, selection: null }
  }

  const mediaType: 'image' | 'video' = media.type === 'video' ? 'video' : 'image'
  const isShort = params.channel === 'youtube' && mediaType === 'video'
    && (options.isShort === true || media.aspectRatio === '9:16')

  if (channelNeedsNineSixteenVideo(params.channel, isShort, mediaType) && media.aspectRatio !== '9:16') {
    const label = params.channel === 'youtube' ? 'YouTube Shorts' : params.channel === 'instagram' ? 'Instagram Reels' : 'TikTok'
    return {
      ok: false,
      message: `${label}には9:16の縦動画が必要です。横動画をShortとして扱いません。素材管理で9:16バリアントを追加してください。`,
    }
  }

  if (params.channel === 'youtube' && thumbnailPick.asset && isShort) {
    return {
      ok: false,
      message:
        'YouTube Shortsはカスタムサムネイルに対応していません。サムネイル指定を外すか、16:9の通常動画として投稿してください。',
    }
  }

  return {
    ok: true,
    selection: {
      media,
      mediaType,
      thumbnail: params.channel === 'youtube' ? thumbnailPick.asset : undefined,
      cover: params.channel === 'instagram' ? coverPick.asset : undefined,
      eyecatch: params.channel === 'note' ? eyecatchPick.asset : undefined,
      isShort,
    },
  }
}
