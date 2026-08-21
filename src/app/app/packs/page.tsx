'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, PackageCheck } from 'lucide-react'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import MobilePostShareButton from '@/components/publish/MobilePostShareButton'
import QueueMediaKit from '@/components/publish/QueueMediaKit'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { PUBLISHING_CHANNEL_CONFIG, getPublishingStrategy } from '@/lib/channels/config'
import { hasPermission } from '@/lib/permissions'
import {
  buildPublishPacks,
  PUBLISH_PACK_STATE_LABELS,
  type PublishPackChannelItem,
} from '@/lib/presentation/publish-pack'
import { getJobActions } from '@/lib/presentation/queue-presenter'
import { buildPublishCopyFields } from '@/lib/services/publish-copy-fields'
import { buildPublishHandoff, formatRevisionForHandoff } from '@/lib/services/publish-handoff'

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('クリップボードへコピーできませんでした。')
}

const STATE_TONE = {
  missing: 'border-stone-200 bg-stone-50 text-gray-500',
  approved: 'border-sky-200 bg-sky-50 text-sky-700',
  ready: 'border-violet-200 bg-violet-50 text-violet-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-stone-200 bg-stone-100 text-gray-500',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
} as const

type PackFilter = 'active' | 'complete' | 'all'

export default function PublishPacksPage() {
  const {
    completeManualPublish,
    currentMember,
    draftRevisions,
    getSeedDetail,
    publishJobs,
    scheduleDraft,
    seeds,
  } = useApp()
  const canManageQueue = Boolean(currentMember && hasPermission(currentMember.role, 'manage_queue'))
  const publishingStrategy = getPublishingStrategy()
  const apiPublishingEnabled = publishingStrategy === 'api-first'
  const [filter, setFilter] = useState<PackFilter>('active')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const packs = useMemo(
    () => buildPublishPacks({ seeds, jobs: publishJobs, revisions: draftRevisions }),
    [draftRevisions, publishJobs, seeds],
  )

  const visiblePacks = useMemo(() => packs.filter((pack) => {
    if (filter === 'active') return !pack.isComplete
    if (filter === 'complete') return pack.isComplete
    return true
  }), [filter, packs])

  const handleSchedule = async (item: PublishPackChannelItem) => {
    if (!item.revision) return
    const key = `${item.channel}-schedule-${item.revision.id}`
    setBusyKey(key)
    try {
      await scheduleDraft(item.revision.socialDraftId)
      setFeedback(`${PUBLISHING_CHANNEL_CONFIG[item.channel].shortLabel}を公開予定へ追加しました。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '公開予定へ追加できませんでした。')
      setFeedback('')
    } finally {
      setBusyKey(null)
    }
  }

  const handleCopy = async (label: string, value: string, key: string) => {
    setBusyKey(key)
    try {
      await copyText(value)
      setFeedback(`${label}をコピーしました。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'コピーできませんでした。')
      setFeedback('')
    } finally {
      setBusyKey(null)
    }
  }

  const handleOpenHandoff = async (item: PublishPackChannelItem) => {
    if (!item.job || !item.revision) return
    const text = formatRevisionForHandoff(item.revision, item.channel)
    const target = buildPublishHandoff(item.channel, text)
    if (!target) {
      setError('この媒体には外部SNSの投稿画面がありません。')
      setFeedback('')
      return
    }

    const opened = window.open(target.url, '_blank', 'noopener,noreferrer')
    const key = `${item.channel}-open-${item.job.id}`
    setBusyKey(key)

    try {
      await copyText(text)
      setFeedback(`${target.instruction}${opened ? ' 投稿文もコピー済みです。' : ' 投稿文はコピー済みですが、投稿画面はブラウザに止められました。'}`)
      setError('')
    } catch (cause) {
      if (target.prefilledText && opened) {
        setFeedback(target.instruction)
        setError('')
      } else {
        setError(cause instanceof Error ? cause.message : '投稿画面は開きましたが、文章をコピーできませんでした。')
        setFeedback('')
      }
    } finally {
      setBusyKey(null)
    }
  }

  const handleComplete = async (item: PublishPackChannelItem) => {
    if (!item.job) return
    const externalUrl = window.prompt('任意：公開された投稿URLを記録できます。')?.trim() || undefined
    const key = `${item.channel}-complete-${item.job.id}`
    setBusyKey(key)
    try {
      await completeManualPublish(item.job.id, externalUrl)
      setFeedback(`${PUBLISHING_CHANNEL_CONFIG[item.channel].shortLabel}を投稿済みにしました。`)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '投稿済みとして記録できませんでした。')
      setFeedback('')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="投稿パック"
        description="1つの発信ごとに、完成文・素材・投稿先・進捗をまとめて、次のSNSへ順番に流せます。"
        actions={<Link href="/app/queue" className="text-sm font-medium text-violet-700 hover:text-violet-800">公開予定の詳細 →</Link>}
      />

      {publishingStrategy === 'zero-cost' && (
        <div className="mb-5">
          <InlineAlert tone="info" title="無料投稿モード">
            対応スマホでは「スマホで共有」から画像・動画と投稿文をOSの共有シートへ渡せます。共有先アプリにうまく渡らない場合も、従来どおり文章コピー＋素材の開く・保存＋SNS投稿画面の導線を使えます。有料投稿APIは呼びません。
          </InlineAlert>
        </div>
      )}

      {feedback && <div className="mb-5"><InlineAlert tone="success">{feedback}</InlineAlert></div>}
      {error && <div className="mb-5"><InlineAlert tone="error">{error}</InlineAlert></div>}

      <div className="mb-5 flex flex-wrap gap-2">
        {([
          ['active', '進行中'],
          ['complete', '完了'],
          ['all', 'すべて'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${filter === value ? 'bg-violet-600 text-white' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {visiblePacks.length === 0 ? (
        <EmptyState
          title={filter === 'complete' ? '完了した投稿パックはまだありません' : '進行中の投稿パックはありません'}
          description="発信ライブラリで投稿先を選び、媒体向け下書きを承認するとここにまとまります。"
          action={<Link href="/app/seeds" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white">発信ライブラリへ</Link>}
        />
      ) : (
        <div className="space-y-6">
          {visiblePacks.map((pack) => {
            const assets = getSeedDetail(pack.seed.id).assets
            return (
              <Card key={pack.seed.id} size="container" className={pack.isComplete ? 'border-emerald-200' : undefined}>
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-semibold text-gray-900">{pack.seed.title}</h2>
                          {pack.isComplete && <Badge tone="success">全媒体完了</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {pack.isComplete
                            ? 'この発信は対象媒体への投稿がすべて完了しています。'
                            : pack.nextChannel
                              ? `次は ${PUBLISHING_CHANNEL_CONFIG[pack.nextChannel.channel].label}。${PUBLISH_PACK_STATE_LABELS[pack.nextChannel.state]}です。`
                              : '次の投稿先を確認してください。'}
                        </p>
                      </div>
                      <Link href={`/app/seeds/${pack.seed.id}`} className="shrink-0 text-xs font-medium text-violet-700 hover:text-violet-800">Seedを編集</Link>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
                        <span>{pack.publishedCount} / {pack.totalCount} 媒体 投稿済み</span>
                        <span>{pack.progressPercent}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pack.progressPercent}%` }} />
                      </div>
                    </div>

                    <QueueMediaKit seedId={pack.seed.id} assets={assets} />
                  </div>

                  <div className="w-full space-y-3 xl:max-w-[34rem]">
                    {pack.channels.map((item) => {
                      const channelLabel = PUBLISHING_CHANNEL_CONFIG[item.channel].shortLabel
                      const copyFields = item.revision ? buildPublishCopyFields(item.revision, item.channel) : []
                      const actions = item.job ? getJobActions(item.job, canManageQueue, apiPublishingEnabled) : null
                      const isNext = pack.nextChannel?.channel === item.channel && !pack.isComplete

                      return (
                        <div key={item.channel} className={`rounded-2xl border p-4 ${isNext ? 'border-violet-300 bg-violet-50/40 ring-1 ring-violet-100' : 'border-stone-200 bg-white'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <ChannelBadge channel={item.channel} />
                              {isNext && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">次に投稿</span>}
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATE_TONE[item.state]}`}>
                              {PUBLISH_PACK_STATE_LABELS[item.state]}
                            </span>
                          </div>

                          {item.revision && item.state !== 'published' && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {copyFields.map((field) => {
                                const key = `${item.channel}-copy-${field.id}-${item.revision?.id}`
                                return (
                                  <Button key={field.id} size="sm" variant="secondary" onClick={() => void handleCopy(field.label, field.value, key)} disabled={busyKey === key}>
                                    <Copy aria-hidden className="h-3.5 w-3.5" />
                                    {field.label}をコピー
                                  </Button>
                                )
                              })}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-start gap-2">
                            {item.state === 'missing' && (
                              <Link href={`/app/seeds/${pack.seed.id}`} className="inline-flex items-center rounded-xl bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700">
                                下書きを準備
                              </Link>
                            )}

                            {item.state === 'approved' && item.revision && canManageQueue && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void handleSchedule(item)}
                                disabled={busyKey === `${item.channel}-schedule-${item.revision.id}`}
                              >
                                公開予定に追加
                              </Button>
                            )}

                            {item.job && actions?.openHandoff && item.revision && (
                              <MobilePostShareButton
                                channel={item.channel}
                                revision={item.revision}
                                assets={assets}
                                disabled={busyKey === `${item.channel}-open-${item.job.id}`}
                              />
                            )}

                            {item.job && actions?.openHandoff && item.revision && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void handleOpenHandoff(item)}
                                disabled={busyKey === `${item.channel}-open-${item.job.id}`}
                              >
                                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                                {channelLabel}へ投稿
                              </Button>
                            )}

                            {item.job && actions?.completeManually && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleComplete(item)}
                                disabled={busyKey === `${item.channel}-complete-${item.job.id}`}
                              >
                                <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                                投稿済みにする
                              </Button>
                            )}

                            {item.state === 'published' && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                                <PackageCheck aria-hidden className="h-4 w-4" />
                                完了
                              </span>
                            )}

                            {(item.state === 'failed' || item.state === 'cancelled' || (apiPublishingEnabled && item.state === 'ready' && !actions?.openHandoff)) && (
                              <Link href="/app/queue" className="inline-flex items-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-stone-50">
                                公開予定で確認
                              </Link>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
