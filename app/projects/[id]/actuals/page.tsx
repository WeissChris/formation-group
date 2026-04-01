'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects,
  loadGanttEntries,
  loadWeeklyActuals,
  loadWeeklyRevenue,
  saveWeeklyActual,
} from '@/lib/storage'
import { formatCurrency, generateId, snapToFriday, toISODate, formatDayMonth } from '@/lib/utils'
import type { Project, GanttEntry, GanttSegment, WeeklyActual, WeeklyRevenue } from '@/types'
import { Check } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────

function getPastAndFutureFridays(pastWeeks: number, futureWeeks: number): Date[] {
  const fridays: Date[] = []
  const d = snapToFriday(new Date())
  d.setDate(d.getDate() - pastWeeks * 7)
  for (let i = 0; i < pastWeeks + futureWeeks + 1; i++) {
    fridays.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return fridays
}

function getWeeksRemaining(ganttEntries: GanttEntry[]): number {
  const today = new Date()
  let latestEnd = today
  for (const e of ganttEntries) {
    for (const s of e.segments) {
      if (s.endDate) {
        const d = new Date(s.endDate)
        if (d > latestEnd) latestEnd = d
      }
    }
  }
  const ms = latestEnd.getTime() - today.getTime()
  return Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)))
}

// For a given category + week, find all active segments and sum their weekly cost allocation
function getBudgetedCostForWeek(entry: GanttEntry, weekIso: string): number {
  return entry.segments.reduce((sum, seg) => {
    if (!seg.startDate || !seg.endDate || seg.weekCount <= 0) return sum
    if (weekIso >= seg.startDate && weekIso <= seg.endDate) {
      return sum + seg.costAllocation / seg.weekCount
    }
    return sum
  }, 0)
}

// Also get from WeeklyRevenue scheduledCost if available (more reliable after forecast generation)
function getBudgetFromRevEntries(revEntries: WeeklyRevenue[], category: string, weekIso: string): number {
  const matching = revEntries.filter(r => r.weekEnding === weekIso && r.notes?.includes(category))
  return matching.reduce((s, r) => s + (r.scheduledCost ?? 0), 0)
}

interface RowState {
  category: string
  crewType: 'Formation' | 'Subcontractor'
  budgetWeek: number         // from Gantt segments
  supplyCost: string
  labourCost: string
  notes: string
  existingId?: string
  activeSegments: GanttSegment[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActualsPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [ganttEntries, setGanttEntries] = useState<GanttEntry[]>([])
  const [allActuals, setAllActuals] = useState<WeeklyActual[]>([])
  const [revEntries, setRevEntries] = useState<WeeklyRevenue[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [rows, setRows] = useState<RowState[]>([])
  const [saved, setSaved] = useState(false)

  const fridays = getPastAndFutureFridays(12, 4)

  useEffect(() => {
    const projs = loadProjects()
    const p = projs.find(p => p.id === id)
    if (!p) return router.push('/projects')
    setProject(p)

    const gantt = loadGanttEntries(id)
    setGanttEntries(gantt)

    const actuals = loadWeeklyActuals(id)
    setAllActuals(actuals)

    const rev = loadWeeklyRevenue().filter(r => r.projectId === id)
    setRevEntries(rev)

    const thisWeek = toISODate(snapToFriday(new Date()))
    setSelectedWeek(thisWeek)
  }, [id, router])

  const buildRows = useCallback((weekIso: string, gantt: GanttEntry[], actuals: WeeklyActual[], rev: WeeklyRevenue[]): RowState[] => {
    // Show entries that have at least one segment active this week, or all entries if none active
    const activeEntries = gantt.filter(e =>
      e.segments.some(s => s.startDate && s.endDate && weekIso >= s.startDate && weekIso <= s.endDate)
    )
    const entries = activeEntries.length > 0 ? activeEntries : gantt

    return entries.map(entry => {
      // Budget from Gantt segments
      const budgetFromGantt = getBudgetedCostForWeek(entry, weekIso)
      // Fallback: from revenue entries scheduledCost
      const budgetFromRev = getBudgetFromRevEntries(rev, entry.category, weekIso)
      const budgetWeek = budgetFromGantt > 0 ? budgetFromGantt : budgetFromRev

      const existing = actuals.find(a => a.projectId === entry.projectId && a.category === entry.category && a.weekEnding === weekIso)
      const activeSegs = entry.segments.filter(s => s.startDate && s.endDate && weekIso >= s.startDate && weekIso <= s.endDate)

      return {
        category: entry.category,
        crewType: entry.crewType,
        budgetWeek,
        supplyCost: existing ? String(existing.supplyCost) : '',
        labourCost: existing ? String(existing.labourCost) : '',
        notes: existing?.notes ?? '',
        existingId: existing?.id,
        activeSegments: activeSegs,
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedWeek) return
    setRows(buildRows(selectedWeek, ganttEntries, allActuals, revEntries))
  }, [selectedWeek, ganttEntries, allActuals, revEntries, buildRows])

  const updateRow = (category: string, field: 'supplyCost' | 'labourCost' | 'notes', value: string) => {
    setRows(prev => prev.map(r => r.category === category ? { ...r, [field]: value } : r))
  }

  const handleSave = () => {
    for (const row of rows) {
      const supply = parseFloat(row.supplyCost) || 0
      const labour = parseFloat(row.labourCost) || 0
      if (supply === 0 && labour === 0 && !row.existingId) continue

      const actual: WeeklyActual = {
        id: row.existingId ?? generateId(),
        projectId: id,
        category: row.category,
        weekEnding: selectedWeek,
        supplyCost: supply,
        labourCost: labour,
        notes: row.notes,
      }
      saveWeeklyActual(actual)
    }
    const fresh = loadWeeklyActuals(id)
    setAllActuals(fresh)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Summaries ─────────────────────────────────────────────────────────────

  const budgetThisWeek = rows.reduce((s, r) => s + r.budgetWeek, 0)
  const actualThisWeek = rows.reduce((s, r) => s + (parseFloat(r.supplyCost) || 0) + (parseFloat(r.labourCost) || 0), 0)
  const varianceThisWeek = budgetThisWeek - actualThisWeek

  const totalBudget = ganttEntries.reduce((s, e) => s + e.budgetedCost, 0)
  const cumulativeActual = allActuals.reduce((s, a) => s + a.supplyCost + a.labourCost, 0)
  const pctUsed = totalBudget > 0 ? (cumulativeActual / totalBudget) * 100 : 0
  const weeksRemaining = getWeeksRemaining(ganttEntries)

  if (!project) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-8 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
        <Link href="/projects" className="hover:text-fg-heading transition-colors">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${id}`} className="hover:text-fg-heading transition-colors">{project.name}</Link>
        <span>/</span>
        <span className="text-fg-heading">Cost Tracker</span>
      </div>

      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">Cost Tracker</h1>
          <p className="text-sm font-light text-fg-muted mt-1">{project.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs font-light text-fg-muted flex items-center gap-1.5">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          <button onClick={handleSave}
            className="px-5 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors">
            Save Actuals
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-fg-border mb-8">
        {[
          { label: 'Budget This Week', value: formatCurrency(budgetThisWeek), colour: '' },
          { label: 'Actual This Week', value: formatCurrency(actualThisWeek), colour: '' },
          { label: 'Variance', value: (varianceThisWeek >= 0 ? '+' : '') + formatCurrency(varianceThisWeek), colour: varianceThisWeek >= 0 ? 'text-fg-heading' : 'text-amber-600/80' },
          { label: '% Budget Used', value: `${pctUsed.toFixed(1)}%`, colour: '' },
          { label: 'Weeks Remaining', value: weeksRemaining > 0 ? String(weeksRemaining) : '—', colour: '' },
        ].map(item => (
          <div key={item.label} className="bg-fg-bg px-4 py-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{item.label}</p>
            <p className={`text-sm font-light tabular-nums ${item.colour || 'text-fg-heading'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Week selector */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap">Week Ending</label>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none"
        >
          {fridays.map(f => {
            const iso = toISODate(f)
            return <option key={iso} value={iso}>{iso} ({formatDayMonth(f)})</option>
          })}
        </select>
      </div>

      {/* No gantt warning */}
      {ganttEntries.length === 0 && (
        <div className="border border-fg-border py-8 text-center mb-6">
          <p className="text-sm font-light text-fg-muted">No Gantt entries found. Set up the Gantt first.</p>
          <Link href={`/projects/${id}/gantt`} className="text-xs font-light text-fg-heading underline mt-2 inline-block">
            Open Gantt →
          </Link>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto border border-fg-border">
          <table className="w-full border-collapse" style={{ minWidth: 700 }}>
            <thead>
              <tr className="border-b border-fg-border">
                {['Category', 'Crew', 'Budget (wk)', 'Segments active', 'Supply $', 'Labour $', 'Total Actual', 'Variance', 'Status'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-[10px] font-light tracking-architectural uppercase text-fg-muted border-r border-fg-border/50 last:border-r-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const supply = parseFloat(row.supplyCost) || 0
                const labour = parseFloat(row.labourCost) || 0
                const total = supply + labour
                const variance = row.budgetWeek - total
                const hasActuals = supply > 0 || labour > 0
                const isOver = hasActuals && variance < 0

                return (
                  <tr key={row.category} className="border-b border-fg-border/40 hover:bg-fg-card/20 transition-colors">
                    <td className="px-3 py-3 text-xs font-light text-fg-heading whitespace-nowrap border-r border-fg-border/30">{row.category}</td>
                    <td className="px-3 py-3 border-r border-fg-border/30">
                      <span className="text-[10px] font-light tracking-wide uppercase px-1.5 py-0.5"
                        style={{ background: row.crewType === 'Formation' ? '#8A858520' : '#C5B8A820', color: row.crewType === 'Formation' ? '#8A8580' : '#A09070' }}>
                        {row.crewType === 'Formation' ? 'Form' : 'Sub'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs font-light text-fg-muted tabular-nums border-r border-fg-border/30">
                      {row.budgetWeek > 0 ? formatCurrency(row.budgetWeek) : <span className="text-fg-muted/40">—</span>}
                    </td>
                    <td className="px-3 py-3 border-r border-fg-border/30">
                      {row.activeSegments.length > 0 ? (
                        <div className="space-y-0.5">
                          {row.activeSegments.map(seg => (
                            <div key={seg.id} className="text-[10px] font-light text-fg-muted">
                              {seg.label ?? 'Segment'} · {formatCurrency(seg.costAllocation / seg.weekCount)}/wk
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-fg-muted/40 text-[10px]">—</span>}
                    </td>
                    <td className="px-2 py-2 border-r border-fg-border/30">
                      <input type="number" min={0} value={row.supplyCost}
                        onChange={e => updateRow(row.category, 'supplyCost', e.target.value)}
                        placeholder="0"
                        className="w-24 px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums" />
                    </td>
                    <td className="px-2 py-2 border-r border-fg-border/30">
                      <input type="number" min={0} value={row.labourCost}
                        onChange={e => updateRow(row.category, 'labourCost', e.target.value)}
                        placeholder="0"
                        className="w-24 px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums" />
                    </td>
                    <td className="px-3 py-3 text-xs font-light tabular-nums border-r border-fg-border/30">
                      {hasActuals ? formatCurrency(total) : <span className="text-fg-muted/40">—</span>}
                    </td>
                    <td className={`px-3 py-3 text-xs font-light tabular-nums border-r border-fg-border/30 ${!hasActuals ? '' : isOver ? 'text-amber-600/80' : 'text-fg-heading'}`}>
                      {hasActuals ? ((variance >= 0 ? '+' : '') + formatCurrency(variance)) : <span className="text-fg-muted/40">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-light">
                      {hasActuals
                        ? isOver
                          ? <span className="text-amber-600/80 text-[10px] tracking-wide uppercase">⚠ Over</span>
                          : <span className="text-fg-muted text-[10px] tracking-wide uppercase">✓ Under</span>
                        : <span className="text-fg-muted/40">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-fg-border">
                <td colSpan={2} className="px-3 py-3 text-[10px] font-light tracking-architectural uppercase text-fg-muted">This week</td>
                <td className="px-3 py-3 text-xs font-light text-fg-heading tabular-nums">{formatCurrency(budgetThisWeek)}</td>
                <td />
                <td /><td />
                <td className="px-3 py-3 text-xs font-light text-fg-heading tabular-nums">{formatCurrency(actualThisWeek)}</td>
                <td className={`px-3 py-3 text-xs font-light tabular-nums ${varianceThisWeek >= 0 ? 'text-fg-heading' : 'text-amber-600/80'}`}>
                  {(varianceThisWeek >= 0 ? '+' : '') + formatCurrency(varianceThisWeek)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
