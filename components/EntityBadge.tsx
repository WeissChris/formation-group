import { cn } from '@/lib/utils'
import type { EntityType } from '@/types'

// Muted monochromatic tones — no vivid colours
const CONFIG: Record<EntityType, { label: string; short: string; className: string }> = {
  design:    { label: 'Design',    short: 'D', className: 'bg-fg-border/40 text-fg-heading' },
  formation: { label: 'Formation', short: 'F', className: 'bg-fg-border/60 text-fg-heading' },
  lume:      { label: 'Lume',      short: 'L', className: 'bg-fg-border/30 text-fg-muted'   },
}

interface Props {
  entity: EntityType
  short?: boolean
  className?: string
}

export default function EntityBadge({ entity, short = false, className }: Props) {
  const cfg = CONFIG[entity]
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-sm font-light text-2xs px-1.5 py-0.5 tracking-wide uppercase',
      cfg.className,
      className
    )}>
      {short ? cfg.short : cfg.label}
    </span>
  )
}
