'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import SeedCard from '@/components/ui/SeedCard'
import { useApp } from '@/lib/app/app-provider'
import { countSeedsByKind, filterSeeds } from '@/lib/presentation/seeds-presenter'
import type { SeedKind } from '@/lib/domain/types'

const KIND_FILTERS: Array<{ label: string; value: SeedKind | 'all' }> = [
  { label: 'すべて', value: 'all' },
  { label: '音楽', value: 'music' },
  { label: '動画', value: 'video' },
  { label: '画像', value: 'image' },
  { label: 'テキスト', value: 'text' },
  { label: '複合', value: 'mixed' },
]

export default function SeedsPage() {
  const router = useRouter()
  const { currentWorkspace, seeds } = useApp()
  const [activeKind, setActiveKind] = useState<SeedKind | 'all'>('all')
  const [search, setSearch] = useState('')

  const filterCounts = useMemo(
    () => countSeedsByKind(seeds, KIND_FILTERS.map((filter) => filter.value)),
    [seeds],
  )

  const filtered = useMemo(() => filterSeeds(seeds, { kind: activeKind, search }), [activeKind, search, seeds])

  return (
    <div>
      <PageHeader
        title="シードライブラリ"
        description={`${currentWorkspace?.name ?? 'このワークスペース'}のための生のアイデアや素材を、媒体ごとの調整前にまとめて保管します。`}
        actions={
          <Link
            href="/app/seeds/new"
            className="inline-flex min-h-touch items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 sm:min-h-control"
          >
            <Plus aria-hidden className="h-4 w-4" />
            新しいシード
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setActiveKind(filter.value)}
              aria-pressed={activeKind === filter.value}
              className={`inline-flex min-h-touch items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition sm:min-h-control ${
                activeKind === filter.value ? 'bg-violet-600 text-white shadow-sm' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'
              }`}
            >
              {filter.label} <span className="text-xs opacity-80">{filterCounts[filter.value]}</span>
            </button>
          ))}
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="シード・原文・タグを検索…" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 lg:max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="シードが見つかりません"
          description={seeds.length === 0 ? 'ざっくりとしたアイデア、ファイル、告知などを1つ取り込んでみましょう。公開できる完成度である必要はありません。' : '別のフィルターや検索語をお試しください。'}
          action={<Link href="/app/seeds/new" className="inline-flex min-h-touch items-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 sm:min-h-control">シードを取り込む</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((seed) => <SeedCard key={seed.id} seed={seed} onClick={() => router.push(`/app/seeds/${seed.id}`)} />)}
        </div>
      )}
    </div>
  )
}
