import type { Seed, SeedKind } from '@/lib/domain/types'

// Pure presenter for the シードライブラリ (UI-PR9). The kind filter, the free-text
// search (title / source / tags), and the per-kind counts are extracted here so
// the matching rules are unit-testable and the page stays a thin view. No
// schema/route change.

export type SeedKindFilter = SeedKind | 'all'

export interface SeedFilter {
  kind: SeedKindFilter
  search: string
}

/** Whether one seed matches a free-text needle (title / source text / any tag). */
function matchesSearch(seed: Seed, needle: string): boolean {
  if (!needle) return true
  return (
    seed.title.toLowerCase().includes(needle) ||
    Boolean(seed.sourceText?.toLowerCase().includes(needle)) ||
    seed.tags.some((tag) => tag.toLowerCase().includes(needle))
  )
}

/** Filter seeds by kind and a trimmed/lowercased search needle. Order preserved. */
export function filterSeeds(seeds: Seed[], filter: SeedFilter): Seed[] {
  const needle = filter.search.trim().toLowerCase()
  return seeds.filter((seed) => {
    const matchesKind = filter.kind === 'all' || seed.kind === filter.kind
    return matchesKind && matchesSearch(seed, needle)
  })
}

/** Count seeds per kind filter value ('all' = total). */
export function countSeedsByKind(seeds: Seed[], kinds: SeedKindFilter[]): Record<string, number> {
  return kinds.reduce<Record<string, number>>((counts, kind) => {
    counts[kind] = kind === 'all' ? seeds.length : seeds.filter((seed) => seed.kind === kind).length
    return counts
  }, {})
}
