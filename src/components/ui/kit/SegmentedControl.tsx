import { cn } from '@/lib/ui/cn'

// A small set of mutually-exclusive choices (e.g. 今すぐ / おすすめの時刻). Rendered
// as a radiogroup so it's keyboard- and screen-reader-friendly.

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export default function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, className }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-full border border-stone-200 bg-white p-0.5 text-xs', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-1.5 font-medium transition',
              selected ? 'bg-violet-600 text-white' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
