'use client'

// Company-wide forecast GP% over time - the portfolio twin of the per-project MarginTrend,
// drawn from the same daily fg_project_snapshots (revenue-weighted across all snapshotted
// jobs per day). Needs at least two distinct dates; until then it explains itself.

import { useEffect, useState } from 'react'
import type { PortfolioTrendPoint } from '@/app/api/snapshots/portfolio/route'

export function PortfolioGpTrend({ targetPct }: { targetPct?: number }) {
  const [points, setPoints] = useState<PortfolioTrendPoint[] | null>(null)

  useEffect(() => {
    fetch('/api/snapshots/portfolio', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setPoints(d?.points ?? []))
      .catch(() => setPoints([]))
  }, [])

  if (!points) return null
  if (points.length < 2) {
    return (
      <div className="border border-fg-border px-5 py-4">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Portfolio GP% trend</p>
        <p className="text-xs font-light text-fg-muted">
          History is building - the daily snapshots need a few more days before there is a line to draw.
          {points.length === 1 && ` Today: ${points[0].gpPct.toFixed(1)}% across ${points[0].jobs} jobs.`}
        </p>
      </div>
    )
  }

  const W = 720, H = 120, PAD = 8
  const vals = points.map(p => p.gpPct)
  const lo = Math.min(...vals, targetPct ?? Infinity) - 3
  const hi = Math.max(...vals, targetPct ?? -Infinity) + 3
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.gpPct).toFixed(1)}`).join(' ')
  const first = points[0], last = points[points.length - 1]
  const delta = last.gpPct - first.gpPct
  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

  return (
    <div className="border border-fg-border px-5 py-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Portfolio GP% trend</p>
        <p className="text-2xs font-light tabular-nums">
          <span className="text-fg-heading">{last.gpPct.toFixed(1)}%</span>
          <span className={`ml-2 ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} pts since {fmtDate(first.date)}
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
        {targetPct !== undefined && (
          <line x1={PAD} x2={W - PAD} y1={y(targetPct)} y2={y(targetPct)} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4 3" />
        )}
        <path d={path} fill="none" stroke="#166534" strokeWidth={1.5} />
        <circle cx={x(points.length - 1)} cy={y(last.gpPct)} r={2.5} fill="#166534" />
      </svg>
      <p className="text-2xs font-light text-fg-muted/70 mt-1">
        Revenue-weighted forecast GP% across all snapshotted jobs, daily{targetPct !== undefined ? ` · dashed line = ${targetPct.toFixed(0)}% target` : ''}.
      </p>
    </div>
  )
}
