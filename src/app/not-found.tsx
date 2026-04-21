import Link from 'next/link'
import EmptyState from '@/components/ui/EmptyState'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-xl">
        <EmptyState
          title="Page not found"
          description="This route is missing from the current prototype. Head back to the dashboard to keep working."
          action={
            <Link
              href="/app/dashboard"
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              Go to dashboard
            </Link>
          }
        />
      </div>
    </div>
  )
}
