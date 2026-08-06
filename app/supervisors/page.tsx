'use client'

// Foremen overview - every supervisor and how each of their live jobs is tracking, in one office
// screen (no cockpit logins). Local data (projects/estimates/gantt/actuals/subbies) feeds the same
// computeScorecard the cockpit runs; the Supabase-only inputs (Xero hours + supply spend, the
// original baseline anchor, unconfirmed materials) come batched from /api/site/overview.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  loadProjects, loadSupervisors, loadEstimatesByProject, loadGanttEntries, loadWeeklyActuals,
  loadSubcontractors,
} from '@/lib/storage'
import { useCrossTabRefresh } from '@/lib/useCrossTabRefresh'
import { isLiveProject } from '@/lib/stageConfig'
import { computeScorecard, type Scorecard, type ScoreStatus } from '@/lib/siteScorecard'
import { scheduleStatus } from '@/lib/projectHealth'
import { formatCurrency, toISODate } from '@/lib/utils'
import { STD_LABOUR_RATE } from '@/lib/estimateCalculations'
import type { Estimate, Project, Supervisor } from '@/types'

interface OverviewRow {
  totalHours: number | null
  supplyCost: number | null
  original: { endDate: string; durationDays: number } | null
  unconfirmedMaterials: number
}

interface JobView {
  project: Project
  card: Scorecard
  slippage: number | null          // days vs planned completion (null = no baseline/forecast)
  slipStatus: 'green' | 'amber' | 'red'
  unconfirmedMaterials: number
  hasHours: boolean
}

const STATUS_COLOUR: Record<ScoreStatus, string> = {
  good: 'text-green-600', watch: 'text-amber-500', over: 'text-red-500', na: 'text-fg-muted',
}
const STATUS_BAR: Record<ScoreStatus, string> = {
  good: 'bg-green-600/70', watch: 'bg-amber-400', over: 'bg-red-400', na: 'bg-fg-border',
}

/** The accepted base estimate + accepted variation line items (mirrors the cockpit BOQ pick, so the
 *  scorecard budgets match what the foreman sees). Falls back to the latest base estimate. */
function scoringEstimate(projectId: string): Estimate | null {
  const all = loadEstimatesByProject(projectId).filter(e => !e.archived)
  const base = all.filter(e => !e.parentEstimateId)
  const accepted = base.filter(e => e.status === 'accepted')
  const pick = (accepted.length ? accepted : base).sort((a, b) => (b.version || 0) - (a.version || 0))[0]
  if (!pick) return null
  const vmos = all.filter(e => e.parentEstimateId && e.status === 'accepted')
  if (vmos.length === 0) return pick
  return { ...pick, lineItems: [...(pick.lineItems || []), ...vmos.flatMap(v => v.lineItems || [])] }
}

export default function SupervisorsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [overview, setOverview] = useState<Record<string, OverviewRow>>({})
  const [loaded, setLoaded] = useState(false)

  const reload = () => {
    setProjects(loadProjects().filter(isLiveProject))
    setSupervisors(loadSupervisors())
    setLoaded(true)
  }
  useEffect(() => { reload() }, [])
  useCrossTabRefresh(['projects', 'estimates', 'gantt', 'actuals', 'all'], () => reload())

  // Supabase-only inputs, one batched call for every live project.
  useEffect(() => {
    const ids = projects.map(p => p.id)
    if (ids.length === 0) return
    fetch(`/api/site/overview?ids=${ids.map(encodeURIComponent).join(',')}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setOverview(d.projects || {}) })
      .catch(() => { /* levers fall back to local data */ })
  }, [projects])

  const today = toISODate(new Date())

  const jobs: JobView[] = useMemo(() => projects.map(project => {
    const gantt = loadGanttEntries(project.id)
    const extra = overview[project.id]
    const card = computeScorecard({
      estimate: scoringEstimate(project.id),
      actuals: loadWeeklyActuals(project.id),
      subbies: loadSubcontractors(project.id),
      gantt, today,
      actualLabourHours: extra?.totalHours ?? null,
      actualSupplyCost: extra?.supplyCost ?? null,
      baseline: extra?.original ?? null,
    })
    const { status, daysSlippage } = scheduleStatus(project, gantt)
    return {
      project, card,
      slippage: daysSlippage, slipStatus: status,
      unconfirmedMaterials: extra?.unconfirmedMaterials ?? 0,
      hasHours: extra?.totalHours != null,
    }
  }), [projects, overview, today])

  // Group by foreman name. Supervisors with no live jobs still show (who's coming free), and jobs
  // whose foreman isn't in the supervisors list get their own group rather than disappearing.
  const groups = useMemo(() => {
    const byName = new Map<string, JobView[]>()
    for (const j of jobs) {
      const key = (j.project.foreman || '').trim() || 'Unassigned'
      byName.set(key, [...(byName.get(key) ?? []), j])
    }
    const named = supervisors.map(s => ({ name: s.name, colour: s.colour, jobs: byName.get(s.name) ?? [] }))
    const known = new Set(supervisors.map(s => s.name))
    const extras = Array.from(byName.keys()).filter(n => !known.has(n)).sort()
      .map(name => ({ name, colour: '#8A8580', jobs: byName.get(name)! }))
    return [...named, ...extras].sort((a, b) => b.jobs.length - a.jobs.length)
  }, [jobs, supervisors])

  if (!loaded) return <div className="max-w-[1200px] mx-auto px-6 py-12"><p className="text-sm font-light text-fg-muted">Loading…</p></div>

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-light tracking-wide text-fg-heading">Foremen</h1>
        <p className="text-sm font-light text-fg-muted mt-1">
          Every supervisor&apos;s live jobs and how they are tracking - the same score and levers their cockpits show.
        </p>
      </div>

      <div className="space-y-8">
        {groups.map(g => (
          <div key={g.name}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.colour }} />
              <h2 className="text-sm font-light tracking-wide text-fg-heading">{g.name}</h2>
              <span className="text-2xs font-light text-fg-muted">
                {g.jobs.length === 0 ? 'no live jobs' : `${g.jobs.length} live job${g.jobs.length === 1 ? '' : 's'}`}
              </span>
            </div>

            {g.jobs.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {g.jobs.map(({ project, card, slippage, slipStatus, unconfirmedMaterials, hasHours }) => {
                  const labour = card.levers.find(l => l.key === 'labour')
                  const allowedHours = labour && labour.budget > 0 ? Math.round(labour.budget / STD_LABOUR_RATE) : null
                  const usedHours = labour ? Math.round(labour.actual / STD_LABOUR_RATE) : null
                  return (
                    <div key={project.id} className="bg-fg-bg border border-fg-border px-5 py-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="min-w-0">
                          <Link href={`/projects/${project.id}`} className="text-sm font-light text-fg-heading hover:underline block truncate">
                            {project.name}
                          </Link>
                          <p className="text-2xs font-light text-fg-muted truncate">{project.address}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xs tracking-architectural uppercase text-fg-muted">Score</p>
                          <p className={`text-xl font-light tabular-nums ${card.score !== null ? STATUS_COLOUR[card.status] : 'text-fg-muted'}`}>
                            {card.score !== null ? card.score : '—'}
                          </p>
                          {card.score === null && <p className="text-2xs font-light text-fg-muted">too early</p>}
                        </div>
                      </div>

                      {/* Schedule: % through + days vs planned completion */}
                      <div className="mb-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-2xs font-light text-fg-muted">Schedule · {Math.round(card.progressPct * 100)}% through</span>
                          <span className={`text-2xs font-light tabular-nums ${
                            slippage === null ? 'text-fg-muted' : slipStatus === 'green' ? 'text-green-600' : slipStatus === 'amber' ? 'text-amber-500' : 'text-red-500'}`}>
                            {slippage === null ? 'no baseline' : slippage <= 0 ? `${Math.abs(slippage)}d ahead` : `${slippage}d behind`}
                          </span>
                        </div>
                        <div className="h-1.5 bg-fg-border/60 rounded-full overflow-hidden">
                          <div className="h-full bg-fg-dark rounded-full" style={{ width: `${Math.min(100, Math.round(card.progressPct * 100))}%` }} />
                        </div>
                      </div>

                      {/* Cost levers - the cockpit's three bars, compact */}
                      <div className="space-y-1.5 mb-3">
                        {card.levers.map(l => (
                          <div key={l.key}>
                            <div className="flex items-baseline justify-between">
                              <span className="text-2xs font-light text-fg-muted">{l.label}</span>
                              <span className={`text-2xs font-light tabular-nums ${STATUS_COLOUR[l.status]}`}>
                                {l.key === 'labour' && hasHours && usedHours !== null && allowedHours !== null
                                  ? `${usedHours}h / ${allowedHours}h`
                                  : l.budget > 0 ? `${formatCurrency(l.actual)} / ${formatCurrency(l.budget)}` : '—'}
                              </span>
                            </div>
                            <div className="h-1 bg-fg-border/60 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${STATUS_BAR[l.status]}`}
                                style={{ width: `${Math.min(100, Math.round(l.consumedPct * 100))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {card.schedule && card.schedule.penalty > 0 && (
                            <span className="text-2xs font-light text-red-500">-{card.schedule.penalty} creep</span>
                          )}
                          {unconfirmedMaterials > 0 && (
                            <span className="text-2xs font-light text-amber-500">{unconfirmedMaterials} material{unconfirmedMaterials === 1 ? '' : 's'} unconfirmed</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Link href={`/projects/${project.id}/gantt`} className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">Gantt</Link>
                          <Link href={`/site/${project.id}`} className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">Cockpit →</Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
