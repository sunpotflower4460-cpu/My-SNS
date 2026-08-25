interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  actions?: React.ReactNode
}

export default function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-[color:var(--border-default)] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[color:var(--accent)]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--text-strong)] sm:text-[2rem]">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">{actions}</div>}
    </div>
  )
}
