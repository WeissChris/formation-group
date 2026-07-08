// Server-only: assemble a project's current delivery metrics (forecast finish vs the frozen original
// baseline, plus labour / materials / subbie usage vs budget) straight from Supabase. Used to capture
// progress snapshots on invoice send and by the safety-net cron. Mirrors the monthly report's maths,
// reusing the same pure libs, so a snapshot and the report always agree. No profit/revenue here.

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { entrySegments } from '@/lib/ganttForecast'
import { computeScorecard, type Scorecard } from '@/lib/siteScorecard'
import { workingDaysBetween } from '@/lib/ganttSchedule'
import { STD_LABOUR_RATE } from '@/lib/estimateCalculations'
import { isLabourAccount } from '@/lib/labour'
import type { Estimate, GanttEntry, SubcontractorPackage } from '@/types'

export interface ProjectMetrics {
  forecastEnd: string
  originalEnd: string          // frozen first-baseline finish (the creep reference); '' if none
  plannedEnd: string
  pctComplete: number
  score: number | null
  labour: { used: number; budget: number }      // hours
  materials: { used: number; budget: number }   // dollars
  subbies: { used: number; budget: number }      // dollars
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function liteGantt(row: Record<string, unknown>): GanttEntry {
  return {
    id: row.id as string, projectId: row.project_id as string, estimateId: (row.estimate_id as string) || '',
    category: row.category as string, crewType: (row.crew_type as GanttEntry['crewType']) || 'Formation',
    budgetedRevenue: Number(row.budgeted_revenue) || 0, budgetedCost: Number(row.budgeted_cost) || 0,
    segments: (row.segments as GanttEntry['segments']) || [], subtasks: (row.subtasks as GanttEntry['subtasks']) || [],
  }
}

/** Fetch + compute the current metrics for one project. Returns null if the project doesn't exist. */
export async function fetchProjectMetrics(pid: string, now = new Date()): Promise<ProjectMetrics | null> {
  if (!supabaseAdmin) return null
  const { data: projRow } = await supabaseAdmin.from('fg_projects').select('*').eq('id', pid).maybeSingle()
  if (!projRow) return null
  const todayIso = iso(now)

  const [ganttRes, estRes, hoursRes, costsRes, baseRes, pkgRes] = await Promise.all([
    supabaseAdmin.from('fg_gantt').select('*').eq('project_id', pid),
    supabaseAdmin.from('fg_estimates').select('*').eq('project_id', pid),
    supabaseAdmin.from('fg_xero_project_hours').select('week_ending, hours').eq('project_id', pid),
    supabaseAdmin.from('fg_xero_project_costs').select('account_name, amount_ex_gst').eq('project_id', pid),
    supabaseAdmin.from('fg_gantt_baselines').select('baselines').eq('project_id', pid).maybeSingle(),
    supabaseAdmin.from('fg_subcontractors').select('approved_value, variations').eq('project_id', pid),
  ])

  const gantt = (ganttRes.data ?? []).map(liteGantt)
  const allEst = (estRes.data ?? []) as Record<string, unknown>[]
  const bases = allEst.filter(e => !e.parent_estimate_id)
  const accepted = bases.filter(e => e.status === 'accepted')
  const baseRow = [...(accepted.length ? accepted : bases)].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
  const estimate = baseRow ? ({ lineItems: (baseRow.line_items as Estimate['lineItems']) || [] } as unknown as Estimate) : null

  const subbies = (pkgRes.data ?? []).map(r => ({
    approvedValue: Number(r.approved_value) || 0, variations: Number(r.variations) || 0,
  })) as unknown as SubcontractorPackage[]

  const hoursRows = (hoursRes.data ?? []).map(r => ({ week: r.week_ending as string, hours: Number(r.hours) || 0 }))
  const totalHours = hoursRows.reduce((s, r) => s + r.hours, 0)
  const supplyCost = (costsRes.data ?? [])
    .filter(r => !isLabourAccount((r.account_name as string) || '') && !/subcontract/i.test((r.account_name as string) || ''))
    .reduce((s, r) => s + (Number(r.amount_ex_gst) || 0), 0)

  // The frozen original plan (first baseline with entries) - the immovable creep reference.
  const baseListAll = Array.isArray(baseRes.data?.baselines) ? baseRes.data!.baselines as { entries?: GanttEntry[] }[] : []
  const firstBase = baseListAll.find(b => b.entries?.length)
  let originalAnchor: { endDate: string; durationDays: number } | null = null
  let originalEnd = ''
  if (firstBase?.entries?.length) {
    let bStart = '', bEnd = ''
    for (const e of firstBase.entries) for (const s of entrySegments(e)) {
      if (!s.startDate || !s.endDate) continue
      if (!bStart || s.startDate < bStart) bStart = s.startDate
      if (!bEnd || s.endDate > bEnd) bEnd = s.endDate
    }
    if (bStart && bEnd) { originalAnchor = { endDate: bEnd, durationDays: Math.max(1, workingDaysBetween(bStart, bEnd)) }; originalEnd = bEnd }
  }

  const card: Scorecard = computeScorecard({
    estimate, actuals: [], subbies, gantt, today: todayIso,
    actualLabourHours: hoursRows.length ? totalHours : null,
    actualSupplyCost: (costsRes.data ?? []).length ? supplyCost : null,
    baseline: originalAnchor,
  })

  let forecastEnd = ''
  for (const e of gantt) for (const s of entrySegments(e)) {
    if (s.endDate && s.endDate > forecastEnd) forecastEnd = s.endDate
  }

  const lever = (key: string) => card.levers.find(l => l.key === key)
  const lab = lever('labour'), mat = lever('materials'), sub = lever('subbies')

  return {
    forecastEnd,
    originalEnd,
    plannedEnd: (projRow.planned_completion as string) || '',
    pctComplete: card.progressPct,
    score: card.score,
    labour: { used: lab ? lab.actual / STD_LABOUR_RATE : 0, budget: lab ? lab.budget / STD_LABOUR_RATE : 0 },
    materials: { used: mat?.actual ?? 0, budget: mat?.budget ?? 0 },
    subbies: { used: sub?.actual ?? 0, budget: sub?.budget ?? 0 },
  }
}
