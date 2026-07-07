'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadProjects, loadGanttEntries, loadSupervisors, loadProposals } from '@/lib/storage'
import { getAllGanttMilestones, getSupervisors, getProposals } from '@/lib/storageAsync'
import { formatCurrency, SHORT_MONTH_NAMES, generateId, toISODate } from '@/lib/utils'
import { entrySegments } from '@/lib/ganttForecast'
import { supervisorColourByName, UNASSIGNED_COLOUR } from '@/lib/supervisors'
import { useCrossTabRefresh } from '@/lib/useCrossTabRefresh'
import type { Project, GanttEntry, Supervisor, DesignProposal } from '@/types'
import EntityBadge from '@/components/EntityBadge'
import { scheduleStatus, healthColour, healthBg, getForecastCompletion } from '@/lib/projectHealth'
import { isLiveProject } from '@/lib/stageConfig'

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
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [colourBy, setColourBy] = useState<'entity' | 'supervisor'>('entity')
  const [showTbc, setShowTbc] = useState(true)
  const [proposals, setProposals] = useState<DesignProposal[]>([])
  const [showPipeline, setShowPipeline] = useState(true)

  useEffect(() => {
    let cancelled = false
    const all = loadProjects()
    setProjects(all)
    setSupervisors(loadSupervisors())
    setProposals(loadProposals())
    // Cross-device: pull proposals so build value + expected construction reflect the latest edits.
    getProposals().then(remote => { if (!cancelled && remote.length) setProposals(remote) }).catch(() => { /* keep local */ })
    const gantt: Record<string, GanttEntry[]> = {}
    const miles: Record<string, ReturnType<typeof loadMilestones>> = {}
    all.forEach(p => {
      gantt[p.id] = loadGanttEntries(p.id)
      miles[p.id] = loadMilestones(p.id)
    })
    setGanttByProject(gantt)
    setMilestonesByProject(miles)
    // Cross-device: pull all projects' milestones from Supabase and overwrite local for projects
    // where a remote row exists (replace-semantics array; remote is the durable last-editor copy).
    ;(async () => {
      try { const sups = await getSupervisors(); if (!cancelled) setSupervisors(sups) } catch { /* keep local */ }
      try {
        const remote = await getAllGanttMilestones()
        if (cancelled || remote.length === 0) return
        setMilestonesByProject(prev => {
          const next = { ...prev }
          for (const r of remote) {
            localStorage.setItem(`fg_gantt_milestones_${r.projectId}`, JSON.stringify(r.milestones))
            next[r.projectId] = r.milestones
          }
          return next
        })
      } catch { /* keep local copies on any sync error */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Live cross-device: re-read supervisors when their colours/names change anywhere.
  useCrossTabRefresh(['supervisors'], () => setSupervisors(loadSupervisors()))
  const supColourByName = supervisorColourByName(supervisors)

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
    if (filterStatus === 'active' && !isLiveProject(p)) return false
    if (filterEntity !== 'all' && p.entity !== filterEntity) return false
    if (filterForeman !== 'all' && p.foreman !== filterForeman) return false
    return true
  })

  // TBC = won/contracted (live) but with no scheduled bars yet - the supervisor hasn't built the
  // Gantt. Self-clears the moment any dated bar exists. Shown as a ghosted block at the contract
  // window so the committed pipeline reads on the programme without cluttering the scheduled work.
  const hasSchedule = (p: Project) =>
    (ganttByProject[p.id] || []).some(e => entrySegments(e).some(s => s.startDate && s.endDate))
  const isTbc = (p: Project) => isLiveProject(p) && !hasSchedule(p)
  const tbcProjects = filtered.filter(isTbc)
  const scheduledProjects = filtered.filter(p => !isTbc(p))

  // Design pipeline: live proposals (draft/sent/pending, not archived) carrying a potential build
  // value - what could flow into construction. Respects the entity filter (design only when set).
  const pipelineProposals = proposals
    .filter(pr => !pr.archived
      && ['draft', 'sent', 'pending'].includes(pr.status)
      && (pr.potentialBuildValue ?? 0) > 0
      && (filterEntity === 'all' || filterEntity === 'design'))
    .sort((a, b) => (a.expectedConstruction || '9999').localeCompare(b.expectedConstruction || '9999'))

  const totalWidth = LABEL_W + CELL_W * WEEKS

  return (
    <div className="w-full px-6 lg:px-12 2xl:px-16 py-12">

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

        {/* Colour by */}
        <div className="flex border border-fg-border text-[10px] font-light tracking-wide uppercase overflow-hidden">
          {([['entity','Entity'],['supervisor','Supervisor']] as ['entity'|'supervisor',string][]).map(([val, label]) => (
            <button key={val} onClick={() => setColourBy(val)}
              className={`px-3 py-1.5 transition-colors border-r border-fg-border last:border-r-0 ${colourBy === val ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'}`}>
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

        {/* Show contracted-but-unscheduled (TBC) rows */}
        <button onClick={() => setShowTbc(v => !v)}
          title="Show contracted projects that haven't been scheduled yet"
          className={`px-3 py-1.5 border text-[10px] font-light tracking-wide uppercase transition-colors ${showTbc ? 'bg-fg-dark text-white/80 border-fg-dark' : 'border-fg-border text-fg-muted hover:text-fg-heading'}`}>
          TBC{tbcProjects.length > 0 ? ` (${tbcProjects.length})` : ''}
        </button>

        {/* Show design pipeline (proposals with a build value) */}
        <button onClick={() => setShowPipeline(v => !v)}
          title="Show the design pipeline - proposals with a potential build value"
          className={`px-3 py-1.5 border text-[10px] font-light tracking-wide uppercase transition-colors ${showPipeline ? 'bg-fg-dark text-white/80 border-fg-dark' : 'border-fg-border text-fg-muted hover:text-fg-heading'}`}>
          Pipeline{pipelineProposals.length > 0 ? ` (${pipelineProposals.length})` : ''}
        </button>

        <span className="text-2xs text-fg-muted ml-auto">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-5 flex-wrap">
        {(colourBy === 'supervisor'
          ? [
              ...supervisors.filter(s => s.name).map(s => ({ colour: s.colour, label: s.name })),
              { colour: UNASSIGNED_COLOUR, label: 'Unassigned' },
            ]
          : [
              { colour: '#8A8580', label: 'Formation / Landscapes' },
              { colour: '#B5A898', label: 'Subcontractor' },
              { colour: '#6BA5C8', label: 'Lume Pools' },
              { colour: '#C8A870', label: 'Design' },
            ]
        ).map(l => (
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
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-2.5 rounded-sm" style={{
            background: 'repeating-linear-gradient(45deg, rgba(138,133,128,0.28), rgba(138,133,128,0.28) 4px, rgba(138,133,128,0.08) 4px, rgba(138,133,128,0.08) 8px)',
            border: '1px dashed rgba(138,133,128,0.55)' }} />
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">Contracted (TBC)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-2.5 rounded-sm" style={{
            background: 'repeating-linear-gradient(45deg, rgba(200,168,112,0.32), rgba(200,168,112,0.32) 4px, rgba(200,168,112,0.10) 4px, rgba(200,168,112,0.10) 8px)',
            border: '1px dashed rgba(200,168,112,0.6)' }} />
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">Design pipeline</span>
        </div>
      </div>

      {filtered.length === 0 && !(showPipeline && pipelineProposals.length > 0) ? (
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
            {scheduledProjects.map(p => {
              const entries = ganttByProject[p.id] || []
              const milestones = milestonesByProject[p.id] || []
              const { status, daysSlippage } = scheduleStatus(p, entries)
              const dot = healthBg(status)
              const col = healthColour(status)
              const planned = p.baseline?.plannedCompletion
              const expected = getForecastCompletion(p, entries)
              const entityColour = p.entity === 'lume' ? '#6BA5C8' : p.entity === 'design' ? '#C8A870' : '#8A8580'
              // In supervisor mode the whole project takes its supervisor's colour (so a team's jobs + gaps
              // read at a glance); in entity mode keep the per-source shading.
              const supColour = supColourByName[p.foreman] || UNASSIGNED_COLOUR

              // Collect all segments across all entries
              type SegRow = { startDate: string; endDate: string; colour: string; label?: string }
              const segRows: SegRow[] = []
              entries.forEach(entry => {
                // entrySegments (not entry.segments) so SPLIT categories — whose bars live on the type
                // lines — still draw. Reading entry.segments alone left split projects showing milestones
                // only, no bars.
                entrySegments(entry).forEach(seg => {
                  if (seg.startDate && seg.endDate) {
                    segRows.push({
                      startDate: seg.startDate,
                      endDate: seg.endDate,
                      colour: colourBy === 'supervisor'
                        ? supColour
                        : (entry.crewType === 'Subcontractor' ? '#B5A898' : entityColour),
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

            {/* ── Contracted, awaiting schedule (TBC) ── */}
            {showTbc && tbcProjects.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-fg-card/25 border-b border-fg-border/40 border-t border-t-fg-border">
                  <span className="text-[10px] font-medium tracking-wide uppercase text-fg-muted">Contracted &mdash; awaiting schedule</span>
                  <span className="text-[9px] text-fg-muted/60">{tbcProjects.length}</span>
                </div>
                {tbcProjects.map(p => {
                  const start = p.startDate
                  const end = p.plannedCompletion
                  const startIdx = start ? fridays.findIndex(f => toISODate(f) >= start) : -1
                  const endIdx = end ? fridays.findIndex(f => toISODate(f) >= end) : -1
                  const hasWindow = startIdx >= 0
                  // No completion date (common before scheduling) -> a short ~4-week ghost anchored
                  // at the start, rather than stretching the bar across the whole horizon.
                  const effEnd = endIdx >= 0 ? endIdx : Math.min(startIdx + 3, fridays.length - 1)
                  const left = hasWindow ? startIdx * CELL_W : 0
                  const width = hasWindow ? Math.max(CELL_W, (effEnd - startIdx + 1) * CELL_W) - 4 : 0
                  return (
                    <div key={p.id} className="border-b border-fg-border/40 hover:bg-fg-card/10 transition-colors">
                      <div className="flex" style={{ minHeight: 42 }}>
                        {/* Project info column */}
                        <div className="flex-shrink-0 flex flex-col justify-center px-3 py-2 border-r border-fg-border" style={{ width: LABEL_W }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <EntityBadge entity={p.entity} short />
                            <Link href={`/projects/${p.id}/gantt`}
                              className="text-xs font-light text-fg-heading hover:text-fg-dark transition-colors truncate max-w-[110px]">
                              {p.name}
                            </Link>
                            <span className="text-[8px] font-semibold tracking-wide uppercase text-fg-muted border border-fg-border/70 px-1 leading-tight rounded-sm">TBC</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.foreman
                              ? <span className="text-[9px] text-fg-muted/70">{p.foreman}</span>
                              : <span className="text-[9px] text-amber-600/90">No supervisor</span>}
                            {start
                              ? <span className="text-[9px] text-fg-muted/60">Target {formatDate(start)}</span>
                              : <span className="text-[9px] text-amber-600/80">Dates TBC</span>}
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="relative flex flex-1" style={{ height: 42 }}>
                          {fridays.map((fri, i) => {
                            const iso = toISODate(fri)
                            const isToday = iso === currentWeekIso
                            const isMonth1 = i > 0 && fri.getMonth() !== fridays[i-1].getMonth()
                            return (
                              <div key={i} style={{ width: CELL_W, minWidth: CELL_W, height: '100%',
                                borderLeft: isMonth1 ? '2px solid rgba(255,255,255,0.08)' : undefined, position: 'relative' }}
                                className={`border-r border-fg-border/20 ${isToday ? 'bg-fg-card/30' : ''}`}>
                                {isToday && <div className="absolute inset-y-0 left-0 w-0.5 bg-red-500/50 z-10 pointer-events-none" />}
                              </div>
                            )
                          })}
                          {/* Ghosted TBC block at the contract window (hatched, dashed) */}
                          {hasWindow && (
                            <div className="absolute top-3 rounded-sm flex items-center justify-center pointer-events-none"
                              style={{ left, width, height: 18,
                                background: 'repeating-linear-gradient(45deg, rgba(138,133,128,0.28), rgba(138,133,128,0.28) 5px, rgba(138,133,128,0.08) 5px, rgba(138,133,128,0.08) 10px)',
                                border: '1px dashed rgba(138,133,128,0.55)' }}
                              title={`${p.name} — target ${start ? formatDate(start) : ''}${end ? ` to ${formatDate(end)}` : ''} (not yet scheduled)`}>
                              <span className="text-[8px] font-medium text-fg-muted tracking-wide">TBC</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* ── Design pipeline (proposals with a potential build value) ── */}
            {showPipeline && pipelineProposals.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-fg-card/25 border-b border-fg-border/40 border-t border-t-fg-border">
                  <span className="text-[10px] font-medium tracking-wide uppercase text-fg-muted">Design pipeline</span>
                  <span className="text-[9px] text-fg-muted/60">{pipelineProposals.length}</span>
                  <span className="text-[9px] text-fg-muted/50 ml-1">
                    {formatCurrency(pipelineProposals.reduce((s, pr) => s + (pr.potentialBuildValue ?? 0), 0))} potential build
                  </span>
                </div>
                {pipelineProposals.map(pr => {
                  const when = pr.expectedConstruction
                  const startIdx = when ? fridays.findIndex(f => toISODate(f) >= when) : -1
                  const hasWindow = startIdx >= 0
                  const effEnd = Math.min(startIdx + 3, fridays.length - 1)   // ~4-week ghost placeholder
                  const left = hasWindow ? startIdx * CELL_W : 0
                  const width = hasWindow ? Math.max(CELL_W, (effEnd - startIdx + 1) * CELL_W) - 4 : 0
                  return (
                    <div key={pr.id} className="border-b border-fg-border/40 hover:bg-fg-card/10 transition-colors">
                      <div className="flex" style={{ minHeight: 42 }}>
                        <div className="flex-shrink-0 flex flex-col justify-center px-3 py-2 border-r border-fg-border" style={{ width: LABEL_W }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <EntityBadge entity="design" short />
                            <Link href={`/design/${pr.id}`}
                              className="text-xs font-light text-fg-heading hover:text-fg-dark transition-colors truncate max-w-[110px]">
                              {pr.clientName}
                            </Link>
                            <span className="text-[8px] font-semibold tracking-wide uppercase text-fg-muted border border-fg-border/70 px-1 leading-tight rounded-sm">
                              {pr.status === 'draft' ? 'DRAFT' : 'PIPELINE'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] text-fg-muted/70 tabular-nums">{formatCurrency(pr.potentialBuildValue ?? 0)}</span>
                            {when
                              ? <span className="text-[9px] text-fg-muted/60">~{formatDate(when)}</span>
                              : <span className="text-[9px] text-amber-600/80">Date TBC</span>}
                          </div>
                        </div>
                        <div className="relative flex flex-1" style={{ height: 42 }}>
                          {fridays.map((fri, i) => {
                            const iso = toISODate(fri)
                            const isToday = iso === currentWeekIso
                            const isMonth1 = i > 0 && fri.getMonth() !== fridays[i-1].getMonth()
                            return (
                              <div key={i} style={{ width: CELL_W, minWidth: CELL_W, height: '100%',
                                borderLeft: isMonth1 ? '2px solid rgba(255,255,255,0.08)' : undefined, position: 'relative' }}
                                className={`border-r border-fg-border/20 ${isToday ? 'bg-fg-card/30' : ''}`}>
                                {isToday && <div className="absolute inset-y-0 left-0 w-0.5 bg-red-500/50 z-10 pointer-events-none" />}
                              </div>
                            )
                          })}
                          {/* Gold-hatched pipeline ghost at the expected construction window */}
                          {hasWindow && (
                            <div className="absolute top-3 rounded-sm flex items-center justify-center pointer-events-none"
                              style={{ left, width, height: 18,
                                background: 'repeating-linear-gradient(45deg, rgba(200,168,112,0.32), rgba(200,168,112,0.32) 5px, rgba(200,168,112,0.10) 5px, rgba(200,168,112,0.10) 10px)',
                                border: '1px dashed rgba(200,168,112,0.6)' }}
                              title={`${pr.clientName} — ${formatCurrency(pr.potentialBuildValue ?? 0)} potential build, expected ~${when ? formatDate(when) : 'TBC'}`}>
                              <span className="text-[8px] font-medium tracking-wide" style={{ color: '#9C7B3A' }}>DESIGN</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'On Schedule', count: scheduledProjects.filter(p => scheduleStatus(p).status === 'green').length, colour: 'text-green-600' },
            { label: 'Watching',    count: scheduledProjects.filter(p => scheduleStatus(p).status === 'amber').length, colour: 'text-amber-500' },
            { label: 'Delayed',     count: scheduledProjects.filter(p => scheduleStatus(p).status === 'red').length,   colour: 'text-red-500' },
            { label: 'Awaiting Schedule', count: tbcProjects.length, colour: 'text-fg-muted' },
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
