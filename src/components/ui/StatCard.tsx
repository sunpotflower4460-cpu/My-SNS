interface StatCardProps {
  label: string
  value: string | number
  icon?: string
  trend?: string
}

export default function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {trend && <p className="mt-1 text-xs text-gray-400">{trend}</p>}
    </div>
  )
}
