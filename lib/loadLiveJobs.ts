// Shared client-side loader for the Live Jobs rows — the same assembly the dashboard does
// (local project/estimate/claim data + the Xero cost feed), exposed so reports can reuse it
// without duplicating the join.

import { loadProjects, loadEstimates, loadProgressClaims, loadGanttEntries } from './storage'
import { isLiveProject } from './stageConfig'
import { getLiveJobs, type LiveJobRow as LiveJobApiRow } from './xero'
import { computeLiveJobRow, computePortfolioTotals, ganttCostTotal, type LiveJobRow, type PortfolioTotals } from './liveJobs'
import type { Project } from '@/types'

export interface LoadedLiveJobs {
  rows: LiveJobRow[]
  totals: PortfolioTotals
  projectsById: Map<string, Project>
  /** Raw per-project API rows (per-discipline spend etc) keyed by project id. */
  apiById: Map<string, LiveJobApiRow>
  configured: boolean
  lastSyncedAt: string | null
}

export async function loadLiveJobs(): Promise<LoadedLiveJobs> {
  const projects = loadProjects()
  const active = projects.filter(isLiveProject)
  const allEstimates = loadEstimates()
  const { items, configured } = await getLiveJobs()
  const costMap = new Map(items.map(it => [it.project_id, it]))

  const rows = active.map(project => {
    const acceptedEstimates = allEstimates.filter(e => e.projectId === project.id && e.status === 'accepted')
    const claims = loadProgressClaims(project.id)
    const apiRow = costMap.get(project.id) ?? null
    // A project mapped to Xero but with NO costs pulled yet comes back as cost_to_date 0 / pulled_at null.
    // That's "no live data", not a real $0 — treat it as null so the forecast falls back to the estimate
    // budget instead of reading $0 cost = 100% GP. last_pulled_at is the "real cost data exists" signal.
    const hasLiveCost = !!(apiRow?.mapped && apiRow.last_pulled_at)
    const gantt = loadGanttEntries(project.id)
    return computeLiveJobRow({
      project,
      acceptedEstimates,
      progressClaims: claims,
      costToDate: hasLiveCost ? apiRow!.cost_to_date : null,
      forecastFinalCost: hasLiveCost ? apiRow!.forecast_final_cost : null,
      ganttCost: gantt.length ? ganttCostTotal(gantt) : null,
      hasForecastOverrides: !!apiRow?.has_overrides,
    })
  })

  const lastSyncedAt = items.map(r => r.last_pulled_at).filter((d): d is string => !!d).sort().pop() ?? null

  return {
    rows,
    totals: computePortfolioTotals(rows),
    projectsById: new Map(projects.map(p => [p.id, p])),
    apiById: costMap,
    configured,
    lastSyncedAt,
  }
}
