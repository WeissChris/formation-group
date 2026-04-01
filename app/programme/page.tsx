'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadProjects, loadGanttEntries } from '@/lib/storage'
import { formatCurrency, SHORT_MONTH_NAMES, generateId, toISODate } from '@/lib/utils'
import type { Project, GanttEntry } from '@/types'
import EntityBadge from '@/components/EntityBadge'
import { scheduleStatus, healthColour, healthBg } from '@/lib/projectHealth'

// ── helpers ───────────────────────────────────────────────────────────────────

function getNextFridays(count: number): Date[] {
  const fridays: Date[] = []
  const d = new Date()
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  for (let i = 0; i < count; i++) {
    fridays.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return fridays
}

function loadMilestones(projectId: string): { id: string; label: string; date: string; colour?: string }[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`fg_gantt_milestones_${projectId}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL_W = 40
const LABEL_W = 220
const WEEKS = 26  // 6 months forward

type FilterEntity = 'all' | 'formation' | 'lume' | 'design'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProgrammePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [ganttByProject, setGanttByProject] = useState<Record<string, GanttEntry[]>>({})
  const [milestonesByProject, setMilestonesByProject] = useState<Record<string, ReturnType<typeof loadMilestones>>>({})
  const [filterEntity, setFilterEntity] = useState<FilterEntity>('all')
  const [filterForeman, setFilterForeman] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'active' | 'all'>('active')

  useEffect(() => {
    const all = loadProjects()
    setProjects(all)
    const gantt: Record<string, GanttEntry[]> = {}
    const miles: Record<string, ReturnType<typeof loadMilestones>> = {}
    all.forEach(p => {
      gantt[p.id] = loadGanttEntries(p.id)
      miles[p.id] = loadMilestones(p.id)
    })
    setGanttByProject(gantt)
    setMilestonesByProject(miles)
  }, [])

  const fridays = getNextFridays(WEEKS)
  const currentWeekIso = toISODate(fridays[0])
  const today = toISODate(new Date())

  // Month groups for header
  const monthGroups: { label: string; count: number }[] = []
  for (const friday of fridays) {
    const m = `${SHORT_MONTH_NAMES[friday.getMonth()]} ${friday.getFullYear()}`
    if (!monthGroups.length || monthGroups[monthGroups.length - 1].label !== m) {
      monthGroups.push({ label: m, count: 1 })
    } else {
      monthGroups[monthGroups.length - 1].count++
    }
  }

  // Filters
  const foremanOptions = ['all', ...Array.from(new Set(projects.map(p => p.foreman).filter(Boolean)))]

  const filtered = projects.filter(p => {
    if (filterStatus === 'active' && p.status !== 'active') return false
    if (filterEntity !== 'all' && p.entity !== filterEntity) return false
    if (filterForeman !== 'all' && p.foreman !== filterForeman) return false
    return true
  })

  const totalWidth = LABEL_W + CELL_W * WEEKS

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-12">

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">Master Programme</h1>
          <p className="text-sm font-light text-fg-muted mt-1">Live schedule across all projects · {WEEKS}-week forward view</p>
        </div>
        <Link href="/projects" className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
          ← All Projects
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Status */}
        <div className="flex border border-fg-border text-[10px] font-light tracking-wide uppercase overflow-hidden">
          {(['active', 'all'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 transition-colors ${filterStatus === s ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'}`}>
              {s === 'active' ? 'Active Only' : 'All'}
            </button>
          ))}
        </div>

        {/* Division */}
        <div className="flex border border-fg-border text-[10px] font-light tracking-wide uppercase overflow-hidden">
          {([['all','All'],['formation','Landscapes'],['lume','Pools'],['design','Design']] as [FilterEntity,string][]).map(([val, label]) => (
            <button key={val} onClick={() => setFilterEntity(val)}
              className={`px-3 py-1.5 transition-colors border-r border-fg-border last:border-r-0 ${filterEntity === val ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Foreman */}
        {foremanOptions.length > 2 && (
          <select value={filterForeman} onChange={e => setFilterForeman(e.target.value)}
            className="px-3 py-1.5 bg-fg-bg border border-fg-border text-fg-muted text-[10px] font-light tracking-wide uppercase rounded-none outline-none focus:border-fg-heading transition-colors appearance-none">
            {foremanOptions.map(f => <option key={f} value={f}>{f === 'all' ? 'All Foremen' : f}</option>)}
          </select>
        )}

        <span className="text-2xs text-fg-muted ml-auto">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-5 flex-wrap">
        {[
          { colour: '#8A8580', label: 'Formation / Landscapes' },
          { colour: '#B5A898', label: 'Subcontractor' },
          { colour: '#6BA5C8', label: 'Lume Pools' },
          { colour: '#C8A870', label: 'Design' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-6 h-2.5 rounded-sm" style={{ background: l.colour }} />
            <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-4 bg-red-500/50" />
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: '#8A8580' }}>◆</span>
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">Milestone</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-fg-border py-20 text-center">
          <p className="text-sm font-light text-fg-muted">No projects match filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-fg-border">
          <div style={{ minWidth: totalWidth }}>
            {/* ── Month header ── */}
            <div className="flex border-b border-fg-border bg-fg-card/20" style={{ paddingLeft: LABEL_W }}>
              {monthGroups.map((mg, i) => (
                <div key={i} style={{ width: mg.count * CELL_W, minWidth: mg.count * CELL_W }}
                  className="border-r border-fg-border px-2 py-1.5 text-[10px] font-light tracking-architectural uppercase text-fg-muted truncate">
                  {mg.label}
                </div>
              ))}
            </div>

            {/* ── Week header ── */}
            <div className="flex border-b-2 border-fg-border" style={{ paddingLeft: LABEL_W }}>
              {fridays.map((fri, i) => {
                const iso = toISODate(fri)
                const isToday = iso === currentWeekIso
                const isMonth1 = i > 0 && fri.getMonth() !== fridays[i-1].getMonth()
                return (
                  <div key={i} style={{ width: CELL_W, minWidth: CELL_W, borderLeft: isMonth1 ? '2px solid rgba(255,255,255,0.15)' : undefined }}
                    className={`border-r border-fg-border/30 py-1 text-center text-[9px] font-light text-fg-muted ${isToday ? 'bg-fg-card/60 text-fg-heading font-medium' : ''}`}>
                    {fri.getDate()}/{fri.getMonth()+1}
                  </div>
                )
              })}
            </div>

            {/* ── Project rows ── */}
            {filtered.map(p => {
              const entries = ganttByProject[p.id] || []
              const milestones = milestonesByProject[p.id] || []
              const { status, daysSlippage } = scheduleStatus(p)
              const dot = healthBg(status)
              const col = healthColour(status)
              const planned = p.baseline?.plannedCompletion
              const expected = p.forecastCompletion || p.plannedCompletion
              const barColour = p.entity === 'lume' ? '#6BA5C8' : p.entity === 'design' ? '#C8A870' : '#8A8580'

              // Collect all segments across all entries
              type SegRow = { startDate: string; endDate: string; colour: string; label?: string }
              const segRows: SegRow[] = []
              entries.forEach(entry => {
                entry.segments.forEach(seg => {
                  if (seg.startDate && seg.endDate) {
                    segRows.push({
                      startDate: seg.startDate,
                      endDate: seg.endDate,
                      colour: entry.crewType === 'Subcontractor' ? '#B5A898' : barColour,
                      label: seg.label || entry.category,
                    })
                  }
                })
              })

              return (
                <div key={p.id} className="border-b border-fg-border/40 hover:bg-fg-card/10 transition-colors group">
                  <div className="flex" style={{ minHeight: 48 }}>

                    {/* Project info column */}
                    <div className="flex-shrink-0 flex flex-col justify-center px-3 py-2 border-r border-fg-border" style={{ width: LABEL_W }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <EntityBadge entity={p.entity} short />
                        <Link href={`/projects/${p.id}`}
                          className="text-xs font-light text-fg-heading hover:text-fg-dark transition-colors truncate max-w-[130px]">
                          {p.name}
                        </Link>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.foreman && <span className="text-[9px] text-fg-muted/70">{p.foreman}</span>}
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block`} />
                          <span className={`text-[9px] font-medium ${col}`}>
                            {status === 'green' ? 'On track'
                              : status === 'amber' ? `${daysSlippage}d late`
                              : `${daysSlippage}d delayed`}
                          </span>
                        </div>
                      </div>
                      {planned && (
                        <p className="text-[9px] text-fg-muted/60 mt-0.5 truncate">
                          Due {formatDate(planned)}
                        </p>
                      )}
                    </div>

                    {/* Timeline columns */}
                    <div className="relative flex flex-1" style={{ height: 48 }}>
                      {/* Column cells */}
                      {fridays.map((fri, i) => {
                        const iso = toISODate(fri)
                        const isToday = iso === currentWeekIso
                        const isMonth1 = i > 0 && fri.getMonth() !== fridays[i-1].getMonth()
                        return (
                          <div key={i} style={{
                            width: CELL_W, minWidth: CELL_W, height: '100%',
                            borderLeft: isMonth1 ? '2px solid rgba(255,255,255,0.08)' : undefined,
                            position: 'relative',
                          }}
                            className={`border-r border-fg-border/20 ${isToday ? 'bg-fg-card/30' : ''}`}>
                            {/* Today line */}
                            {isToday && (
                              <div className="absolute inset-y-0 left-0 w-0.5 bg-red-500/50 z-10 pointer-events-none" />
                            )}
                          </div>
                        )
                      })}

                      {/* Segment bars (absolute overlay) */}
                      {segRows.map((seg, si) => {
                        const startIdx = fridays.findIndex(f => toISODate(f) >= seg.startDate)
                        const endIdx = fridays.findIndex(f => toISODate(f) >= seg.endDate)
                        if (startIdx < 0) return null
                        const effectiveEnd = endIdx >= 0 ? endIdx : fridays.length - 1
                        const left = startIdx * CELL_W
                        const width = Math.max(CELL_W, (effectiveEnd - startIdx + 1) * CELL_W)
                        return (
                          <div key={si}
                            className="absolute top-2.5 rounded-sm pointer-events-none"
                            style={{
                              left,
                              width: width - 4,
                              height: 20,
                              background: seg.colour,
                              opacity: 0.85,
                            }}
                            title={seg.label}
                          />
                        )
                      })}

                      {/* Milestones (absolute overlay) */}
                      {milestones.map(m => {
                        const mDate = new Date(m.date)
                        const mIso = toISODate(mDate)
                        const colIdx = fridays.findIndex(f => toISODate(f) >= mIso)
                        if (colIdx < 0) return null
                        const left = colIdx * CELL_W + CELL_W / 2 - 6
                        return (
                          <div key={m.id}
                            className="absolute pointer-events-none flex flex-col items-center"
                            style={{ left, top: 4, width: 12 }}
                            title={m.label}
                          >
                            <span className="text-xs leading-none" style={{ color: m.colour || '#8A8580' }}>◆</span>
                            <span className="text-[7px] text-fg-muted/70 mt-0.5 whitespace-nowrap leading-tight text-center" style={{ maxWidth: 40 }}>
                              {m.label}
                            </span>
                          </div>
                        )
                      })}

                      {/* Planned completion marker */}
                      {planned && (() => {
                        const colIdx = fridays.findIndex(f => toISODate(f) >= planned)
                        if (colIdx < 0) return null
                        const col2 = healthColour(status)
                        return (
                          <div className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
                            style={{ left: colIdx * CELL_W, background: status === 'green' ? '#22c55e80' : status === 'amber' ? '#f59e0b80' : '#ef444480' }}
                            title={`Planned: ${formatDate(planned)}`}
                          />
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            { label: 'On Schedule', count: filtered.filter(p => scheduleStatus(p).status === 'green').length, colour: 'text-green-600' },
            { label: 'Watching',    count: filtered.filter(p => scheduleStatus(p).status === 'amber').length, colour: 'text-amber-500' },
            { label: 'Delayed',     count: filtered.filter(p => scheduleStatus(p).status === 'red').length,   colour: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="border border-fg-border px-4 py-3 text-center">
              <p className={`text-xl font-light tabular-nums ${s.colour}`}>{s.count}</p>
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
