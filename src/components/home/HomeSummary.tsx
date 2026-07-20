import Link from 'next/link'

// Small at-a-glance counts, intentionally at the BOTTOM of the home screen:
// numbers are context, not the main task. Each tile links to where the creator
// would act on it.

export interface HomeSummaryStat {
  label: string
  value: number
  href: string
}

export default function HomeSummary({ stats }: { stats: HomeSummaryStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="rounded-card border border-stone-200 bg-white px-4 py-3 transition hover:border-violet-200 hover:bg-violet-50/30"
        >
          <p className="text-2xl font-semibold tabular-nums text-gray-900">{stat.value}</p>
          <p className="mt-0.5 text-xs text-gray-500">{stat.label}</p>
        </Link>
      ))}
    </div>
  )
}
