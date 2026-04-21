interface EmptyStateProps {
  title: string
  description: string
  action?: React.ReactNode
  icon?: string
}

export default function EmptyState({ title, description, action, icon = '📭' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-stone-200 bg-white px-4 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-2xl">
        {icon}
      </div>
      <h3 className="mb-1 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mb-4 max-w-sm text-sm leading-6 text-gray-500">{description}</p>
      {action}
    </div>
  )
}
