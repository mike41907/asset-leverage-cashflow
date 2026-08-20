import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  description?: string
  icon: LucideIcon
  tone?: 'teal' | 'navy' | 'amber' | 'violet'
  valueClassName?: string
  trailing?: ReactNode
}

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = 'teal',
  valueClassName = '',
  trailing,
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <div className="metric-card-topline">
        <div className="metric-icon"><Icon size={18} strokeWidth={2} /></div>
        {trailing}
      </div>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${valueClassName}`}>{value}</div>
      {description && <div className="metric-description">{description}</div>}
    </article>
  )
}
