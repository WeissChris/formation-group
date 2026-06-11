// Shared client-side loader for the Live Jobs rows — the same assembly the dashboard does
// (local project/estimate/claim data + the Xero cost feed), exposed so reports can reuse it
// without duplicating the join.

import { loadProjects, loadEstimates, loadProgressClaims } from './storage'
import { getLiveJobs } from './xero'
import { computeLiveJobRow, computePortfolioTotals, type LiveJobRow, type PortfolioTotals } from './liveJobs'
import type { Project } from '@/types'

export interface LoadedLiveJobs {
  rows: LiveJobRow[]
  totals: PortfolioTotals
  projectsById: Map<string, Project>
  configured: boolean
  lastSyncedAt: string | null
}

export async function loadLiveJobs(): Promise<LoadedLiveJobs> {
  const projects = loadProjects()
  const active = projects.filter(p => p.status === 'active')
  const allEstimates = loadEstimates()
  const { items, configured } = await getLiveJobs()
  const costMap = new Map(items.map(it => [it.project_id, it]))

  const rows = active.map(project => {
    const acceptedEstimates = allEstimates.filter(e => e.projectId === project.id && e.status === 'accepted')
    const claims = loadProgressClaims(project.id)
    const apiRow = costMap.get(project.id) ?? null
    return computeLiveJobRow({
      project,
      acceptedEstimates,
      progressClaims: claims,
      costToDate: apiRow?.mapped ? apiRow.cost_to_date : null,
      forecastFinalCost: apiRow?.mapped ? apiRow.forecast_final_cost : null,
    })
  })

  const lastSyncedAt = items.map(r => r.last_pulled_at).filter((d): d is string => !!d).sort().pop() ?? null

  return {
    rows,
    totals: computePortfolioTotals(rows),
    projectsById: new Map(projects.map(p => [p.id, p])),
    configured,
    lastSyncedAt,
  }
}
