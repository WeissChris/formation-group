// Server-only: capture one progress snapshot for a project and append it to fg_progress_snapshots.
// Called on invoice send (trigger 'invoice'), when a job goes Active (trigger 'active'), and by the
// safety-net cron (trigger 'auto'). Append-only against the frozen original baseline; same-day repeats
// replace that day's snapshot rather than stacking (a re-saved invoice, or cron colliding with a send).

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchProjectMetrics } from '@/lib/projectMetrics'
import { dayGap, type ProgressSnapshot, type SnapshotTrigger } from '@/lib/progressSnapshot'

export async function captureSnapshot(
  pid: string, trigger: SnapshotTrigger, now = new Date(),
): Promise<{ ok: boolean; captured: boolean; reason?: string }> {
  if (!supabaseAdmin) return { ok: false, captured: false, reason: 'not_configured' }
  const metrics = await fetchProjectMetrics(pid, now)
  if (!metrics) return { ok: false, captured: false, reason: 'no_project' }

  const { data } = await supabaseAdmin.from('fg_progress_snapshots').select('snapshots').eq('project_id', pid).maybeSingle()
  const existing = (Array.isArray(data?.snapshots) ? data!.snapshots : []) as ProgressSnapshot[]

  const creepDays = metrics.originalEnd && metrics.forecastEnd ? dayGap(metrics.originalEnd, metrics.forecastEnd) : 0
  const snap: ProgressSnapshot = {
    id: `${trigger}-${now.toISOString()}`,
    capturedAt: now.toISOString(),
    trigger,
    forecastEnd: metrics.forecastEnd,
    originalEnd: metrics.originalEnd,
    plannedEnd: metrics.plannedEnd,
    creepDays,
    pctComplete: metrics.pctComplete,
    labourUsedH: Math.round(metrics.labour.used),
    labourBudgetH: Math.round(metrics.labour.budget),
    costUsed: Math.round(metrics.materials.used),
    costBudget: Math.round(metrics.materials.budget),
    subUsed: Math.round(metrics.subbies.used),
    subBudget: Math.round(metrics.subbies.budget),
    score: metrics.score,
  }

  const today = now.toISOString().slice(0, 10)
  const next = [...existing.filter(s => s.capturedAt.slice(0, 10) !== today), snap]
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))

  const { error } = await supabaseAdmin.from('fg_progress_snapshots').upsert({
    project_id: pid, snapshots: next, updated_at: now.toISOString(),
  })
  if (error) return { ok: false, captured: false, reason: error.message }
  return { ok: true, captured: true }
}
