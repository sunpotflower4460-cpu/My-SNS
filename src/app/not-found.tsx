import Link from 'next/link'
import EmptyState from '@/components/ui/EmptyState'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-xl">
        <EmptyState
          title="ページが見つかりません"
          description="このページは現在のプロトタイプにはまだ用意されていません。ダッシュボードに戻って作業を続けてください。"
          action={
            <Link
              href="/app/dashboard"
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              ダッシュボードへ戻る
            </Link>
          }
        />
      </div>
    </div>
  )
}
