import Link from 'next/link'
import { ArrowRight, CheckCircle2, PackageCheck } from 'lucide-react'
import ChannelBadge from '@/components/ui/ChannelBadge'
import { Badge, Card } from '@/components/ui/kit'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { PUBLISH_PACK_STATE_LABELS } from '@/lib/presentation/publish-pack'
import type { TodayPublishingOverview } from '@/lib/presentation/today-publishing'

interface TodayPublishingPanelProps {
  overview: TodayPublishingOverview
}

export default function TodayPublishingPanel({ overview }: TodayPublishingPanelProps) {
  const { duePacks, nextPack, nextChannel, activeCount } = overview

  return (
    <section aria-label="今日の投稿" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-violet-500">PUBLISHING</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">今日投稿するパック</h2>
          <p className="mt-1 text-sm text-gray-500">今日までに投稿するものを先に。終わったら次の1件へ進めます。</p>
        </div>
        <Link href="/app/packs" className="text-sm font-medium text-violet-700 hover:text-violet-800">
          投稿パックをすべて見る →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
        <Card size="container" padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <PackageCheck aria-hidden className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold text-gray-900">今日やる</p>
            </div>
            <Badge tone={duePacks.length > 0 ? 'accent' : 'neutral'}>{duePacks.length}パック</Badge>
          </div>

          {duePacks.length === 0 ? (
            <div className="px-5 py-7 sm:px-6">
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-4">
                <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-emerald-900">今日までの投稿予定はありません</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-700">下の「次にやること」から、進行中の発信を1つ前へ進められます。</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {duePacks.slice(0, 4).map((pack) => (
                <div key={pack.seed.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{pack.seed.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {pack.channels.slice(0, 4).map((item) => <ChannelBadge key={item.channel} channel={item.channel} />)}
                      <span className="text-xs text-gray-400">{pack.publishedCount}/{pack.totalCount} 投稿済み</span>
                    </div>
                  </div>
                  <Link
                    href={`/app/packs#pack-${pack.seed.id}`}
                    className="inline-flex min-h-touch shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700"
                  >
                    投稿を進める
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                </div>
              ))}
              {duePacks.length > 4 && (
                <div className="px-5 py-3 text-center sm:px-6">
                  <Link href="/app/packs" className="text-xs font-medium text-violet-700 hover:text-violet-800">残り{duePacks.length - 4}パックも見る</Link>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card size="container" tone="selected" className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.08em] text-violet-600">NEXT</p>
              <span className="text-xs text-violet-500">進行中 {activeCount}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-gray-900">次にやること</h3>

            {nextPack && nextChannel ? (
              <div className="mt-4">
                <p className="line-clamp-2 text-lg font-semibold leading-7 text-gray-900">{nextPack.seed.title}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ChannelBadge channel={nextChannel.channel} />
                  <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700">
                    {PUBLISH_PACK_STATE_LABELS[nextChannel.state]}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {PUBLISHING_CHANNEL_CONFIG[nextChannel.channel].label}を次に進めると、この発信が完成に近づきます。
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-gray-600">進行中の投稿パックはありません。新しい発信を作れます。</p>
            )}
          </div>

          <Link
            href={nextPack ? `/app/packs#pack-${nextPack.seed.id}` : '/app/seeds/new'}
            className="mt-5 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            {nextPack ? 'この投稿を続ける' : '新しい発信を作る'}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </Card>
      </div>
    </section>
  )
}
