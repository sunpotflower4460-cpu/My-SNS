interface StatCardProps {
  label: string
  value: string | number
  icon?: string
  trend?: string
}

export default function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100/70">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-3xl font-semibold tracking-tight text-gray-900">{value}</p>
      {trend && <p className="mt-1 text-xs text-gray-400">{trend}</p>}
    </div>
  )
}
