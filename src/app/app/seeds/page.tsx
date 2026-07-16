'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import SeedCard from '@/components/ui/SeedCard'
import { useApp } from '@/lib/app/app-provider'
import type { SeedKind } from '@/lib/domain/types'

const KIND_FILTERS: Array<{ label: string; value: SeedKind | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Music', value: 'music' },
  { label: 'Video', value: 'video' },
  { label: 'Image', value: 'image' },
  { label: 'Text', value: 'text' },
  { label: 'Mixed', value: 'mixed' },
]

export default function SeedsPage() {
  const router = useRouter()
  const { currentWorkspace, seeds } = useApp()
  const [activeKind, setActiveKind] = useState<SeedKind | 'all'>('all')
  const [search, setSearch] = useState('')

  const filterCounts = useMemo(
    () => KIND_FILTERS.reduce<Record<string, number>>((accumulator, filter) => {
      accumulator[filter.value] = filter.value === 'all'
        ? seeds.length
        : seeds.filter((seed) => seed.kind === filter.value).length
      return accumulator
    }, {}),
    [seeds],
  )

  const filtered = useMemo(
    () => seeds.filter((seed) => {
      const needle = search.trim().toLowerCase()
      const matchesKind = activeKind === 'all' || seed.kind === activeKind
      const matchesSearch = !needle
        || seed.title.toLowerCase().includes(needle)
        || seed.sourceText?.toLowerCase().includes(needle)
        || seed.tags.some((tag) => tag.toLowerCase().includes(needle))
      return matchesKind && matchesSearch
    }),
    [activeKind, search, seeds],
  )

  return (
    <div>
      <PageHeader
        title="Seed Library"
        description={`Raw ideas and assets for ${currentWorkspace?.name ?? 'this workspace'}, captured once before channel adaptation.`}
        actions={<Link href="/app/seeds/new" className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700">+ New Seed</Link>}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {KIND_FILTERS.map((filter) => (
            <button key={filter.value} onClick={() => setActiveKind(filter.value)} className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${activeKind === filter.value ? 'bg-violet-600 text-white shadow-sm' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'}`}>
              {filter.label} <span className="text-xs opacity-80">{filterCounts[filter.value]}</span>
            </button>
          ))}
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Seeds, source text, or tags…" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 lg:max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Seeds found"
          description={seeds.length === 0 ? 'Capture one rough idea, file, or announcement. It does not need to be publication-ready.' : 'Try another filter or search term.'}
          action={<Link href="/app/seeds/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">Capture a Seed</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((seed) => <SeedCard key={seed.id} seed={seed} onClick={() => router.push(`/app/seeds/${seed.id}`)} />)}
        </div>
      )}
    </div>
  )
}
