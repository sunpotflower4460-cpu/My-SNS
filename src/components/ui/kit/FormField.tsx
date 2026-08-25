import { useId } from 'react'
import { cn } from '@/lib/ui/cn'

// Wraps a single form control with a real <label>, an optional description, and
// an error — wiring htmlFor / aria-describedby / aria-invalid so the control is
// properly labelled and its error is announced. Children is a render-prop that
// receives the ids to spread onto the input/textarea/select.

export interface FormFieldChildProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export interface FormFieldProps {
  label: string
  description?: string
  error?: string
  required?: boolean
  className?: string
  children: (props: FormFieldChildProps) => React.ReactNode
}

export default function FormField({ label, description, error, required, className, children }: FormFieldProps) {
  const id = useId()
  const descriptionId = description ? `${id}-desc` : undefined
  const errorId = error ? `${id}-err` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-[color:var(--text-strong)]">
        {label}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden>*</span>}
      </label>
      {description && (
        <p id={descriptionId} className="text-xs leading-5 text-[color:var(--text-muted)]">
          {description}
        </p>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}
