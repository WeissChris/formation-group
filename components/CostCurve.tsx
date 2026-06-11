'use client'

import { useEffect, useState } from 'react'
import { loadWeeklyRevenue } from '@/lib/storage'
import { getProjectCostPeriods } from '@/lib/xero'
import { buildCostCurve, type CostPeriod, type CostCurve as Curve } from '@/lib/costCurve'
import { formatCurrency, toISODate } from '@/lib/utils'

/**
 * Cumulative budget-vs-actual cost S-curve for one project.
 *
 * Budget = the Gantt weekly cost model (WeeklyRevenue.scheduledCost, localStorage).
 * Actual = time-phased Xero cost (weekly supply + monthly labour) from /api/projects/:id/cost-periods.
 * Read cumulatively (cost-to-date), so a late supplier invoice still lands — the most recent weeks
 * are flagged provisional because suppliers are still invoicing.
 */
export function CostCurve({ projectId }: { projectId: string }) {
  const [curve, setCurve] = useState<Curve | null>(null)
  const [loading, setLoading] = useState(true)
  const [labourTotal, setLabourTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const budget = loadWeeklyRevenue()
        .filter(r => r.projectId === projectId && (r.scheduledCost || 0) > 0)
        .map(r => ({ weekEnding: r.weekEnding, scheduledCost: r.scheduledCost || 0 }))
      const { periods } = await getProjectCostPeriods(projectId)
      if (cancelled) return
      const actual: CostPeriod[] = periods.map(p => ({
        period_end: p.period_end, amount_ex_gst: p.amount_ex_gst, source: p.source, grain: p.grain,
      }))
      setLabourTotal(actual.filter(a => a.source === 'labour').reduce((s, a) => s + a.amount_ex_gst, 0))
      setCurve(buildCostCurve(budget, actual))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [projectId])

  if (loading) {
    return <div className="border border-fg-border p-5"><p className="text-xs font-light text-fg-muted">Loading cost curve…</p></div>
  }
  if (!curve || curve.points.length < 2) {
    return (
      <div className="border border-fg-border p-5">
        <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted mb-1">Cost — budget vs actual</p>
        <p className="text-xs font-light text-fg-muted">
          Not enough data yet. Generate a revenue forecast on the Gantt (for the budget line) and sync Xero (for actuals).
        </p>
      </div>
    )
  }

  const pts = curve.points
  const today = toISODate(new Date())
  // budget/actual to date = the cumulative at the last week on or before today
  const atToday = [...pts].reverse().find(p => p.weekEnding <= today) ?? pts[pts.length - 1]
  const budgetToDate = atToday.cumBudget
  const actualToDate = atToday.cumActual
  const variance = actualToDate - budgetToDate          // + = over budget (bad)
  const overBudget = variance > 0

  // ── chart geometry ──
  const W = 680, H = 240
  const PAD = { l: 64, r: 16, t: 16, b: 30 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const n = pts.length
  const maxY = Math.max(curve.totalBudget, pts[n - 1].cumActual, 1)
  const x = (i: number) => PAD.l + (i / (n - 1)) * innerW
  const y = (v: number) => PAD.t + innerH - (v / maxY) * innerH
  const path = (key: 'cumBudget' | 'cumActual') =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')

  const GREY = '#9E9890', GREEN = '#3D5A3A', RED = '#C0563B'
  const actualColor = overBudget ? RED : GREEN
  const todayIdx = pts.findIndex(p => p.weekEnding >= today)
  const todayX = todayIdx >= 0 ? x(todayIdx) : null

  return (
    <div className="border border-fg-border p-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted">Cost — budget vs actual (to date)</p>
        <p className="text-2xs font-light text-fg-muted">Cumulative</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-2xs text-fg-muted mb-0.5">Budget to date</p>
          <p className="text-base font-light tabular-nums text-fg-heading">{formatCurrency(budgetToDate)}</p>
        </div>
        <div>
          <p className="text-2xs text-fg-muted mb-0.5">Actual to date</p>
          <p className="text-base font-light tabular-nums" style={{ color: actualColor }}>{formatCurrency(actualToDate)}</p>
        </div>
        <div>
          <p className="text-2xs text-fg-muted mb-0.5">{overBudget ? 'Over budget' : 'Under budget'}</p>
          <p className="text-base font-light tabular-nums" style={{ color: overBudget ? RED : GREEN }}>
            {formatCurrency(Math.abs(variance))}
          </p>
        </div>
      </div>

      {/* S-curve */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img" aria-label="Cumulative budget vs actual cost">
        {/* gridlines */}
        <line x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} stroke="#E5E2DD" strokeWidth="1" />
        <line x1={PAD.l} y1={y(maxY)} x2={W - PAD.r} y2={y(maxY)} stroke="#F0EEEB" strokeWidth="1" />
        <text x={PAD.l - 8} y={y(maxY) + 4} textAnchor="end" fontSize="10" fill="#8A8580">{formatCurrency(maxY)}</text>
        <text x={PAD.l - 8} y={y(0) + 4} textAnchor="end" fontSize="10" fill="#8A8580">$0</text>
        {/* today marker */}
        {todayX !== null && (
          <>
            <line x1={todayX} y1={PAD.t} x2={todayX} y2={y(0)} stroke="#C8A870" strokeWidth="1" strokeDasharray="3 3" />
            <text x={todayX} y={PAD.t - 4} textAnchor="middle" fontSize="9" fill="#C8A870">today</text>
          </>
        )}
        {/* budget (grey, dashed) + actual (solid) */}
        <path d={path('cumBudget')} fill="none" stroke={GREY} strokeWidth="2" strokeDasharray="5 4" />
        <path d={path('cumActual')} fill="none" stroke={actualColor} strokeWidth="2.5" />
      </svg>

      {/* legend + provenance */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-2xs font-light text-fg-muted">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: GREY }} /> Budget (Gantt)
        </span>
        <span className="flex items-center gap-1.5 text-2xs font-light text-fg-muted">
          <span className="inline-block w-4 border-t-2" style={{ borderColor: actualColor }} /> Actual (Xero)
        </span>
        {labourTotal > 0 && (
          <span className="text-2xs font-light text-fg-muted">· incl. {formatCurrency(labourTotal)} labour (monthly)</span>
        )}
      </div>
      <p className="text-2xs font-light text-fg-muted/70 mt-2">
        Most recent weeks are provisional — supply invoices are still landing, and labour books monthly.
      </p>
    </div>
  )
}
