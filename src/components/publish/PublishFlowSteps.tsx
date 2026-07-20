import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/kit'
import type { PublishFlow, StepState } from '@/lib/presentation/publish-flow'

// The 発信 stepper shown at the top of the seed page. State is carried by a
// marker (a ✓ for done, the step number otherwise) AND a worded label ("完了" /
// "いまここ" / "これから"), never colour alone (§17.7). One primary action
// ("次のステップ") — the single thing to do next.

const STATE_META: Record<StepState, { label: string; markerClass: string; textClass: string }> = {
  done: { label: '完了', markerClass: 'bg-emerald-100 text-emerald-700', textClass: 'text-gray-500' },
  current: { label: 'いまここ', markerClass: 'bg-violet-600 text-white', textClass: 'text-gray-900 font-semibold' },
  todo: { label: 'これから', markerClass: 'bg-stone-100 text-stone-400', textClass: 'text-gray-400' },
}

export default function PublishFlowSteps({ flow }: { flow: PublishFlow }) {
  const currentStep = flow.steps.find((step) => step.state === 'current')

  return (
    <Card size="container" padded className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">発信の進みぐあい</h2>
        {flow.targetChannels > 0 && (
          <span className="text-xs text-gray-500">
            承認済み {flow.approvedChannels}/{flow.targetChannels} 媒体
          </span>
        )}
      </div>

      <ol className="grid gap-3 sm:grid-cols-4">
        {flow.steps.map((step, index) => {
          const meta = STATE_META[step.state]
          return (
            <li key={step.id} className="flex gap-3 sm:flex-col sm:gap-2">
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium ${meta.markerClass}`}>
                  {step.state === 'done' ? <Check aria-hidden className="h-4 w-4" /> : index + 1}
                </span>
                <span className="text-[11px] text-gray-400 sm:hidden">{meta.label}</span>
              </div>
              <div className="min-w-0">
                <p className={`text-sm ${meta.textClass}`}>{step.label}</p>
                <p className="mt-0.5 hidden text-xs leading-5 text-gray-400 sm:block">{meta.label}</p>
              </div>
            </li>
          )
        })}
      </ol>

      {flow.primary ? (
        <div className="flex flex-col gap-3 rounded-card border border-violet-100 bg-violet-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-violet-700">次のステップ</p>
            <p className="mt-0.5 text-sm text-gray-700">{currentStep?.description}</p>
          </div>
          <Link
            href={flow.primary.href}
            className="inline-flex min-h-control shrink-0 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            {flow.primary.label}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-card border border-emerald-100 bg-emerald-50 p-4">
          <Check aria-hidden className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm text-gray-700">この発信は公開の予約まで完了しています。おつかれさまでした。</p>
        </div>
      )}
    </Card>
  )
}
