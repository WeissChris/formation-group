// Invoiced-revenue writeback - turns sent/paid progress claims (or invoiced/paid payment
// stages) into WeeklyRevenue rows, so the Revenue Calendar's green invoiced figures, the
// quarter Invoiced bars and the project Revenue tab reflect real billing. Before this,
// WeeklyRevenue.actualInvoiced had readers but NO writer - every "invoiced" figure derived
// from it was silently zero on real data.
//
// Rows are tagged with a trailing "(Invoiced)" in notes - the same regenerate-safe pattern as
// the gantt's "(Gantt)" rows: the sync deletes and rebuilds ONLY rows carrying the tag, so
// manual deposits and gantt forecast rows are never touched (and the gantt regen never touches
// these). plannedRevenue stays 0 on these rows - planned comes from the gantt rows; only
// actualInvoiced carries value, and the readers sum the two independently per week.

import type { Project, ProgressClaim, ProgressPaymentStage, WeeklyRevenue } from '@/types'
import { toISODate, snapToFriday } from '@/lib/utils'
import { loadProjects, loadProgressClaims, loadProgressPaymentStages, loadWeeklyRevenue } from '@/lib/storage'
import { upsertRevenue, deleteWeeklyRevenueAsync } from '@/lib/storageAsync'

export const INVOICED_TAG = '(Invoiced)'

export function isInvoicedRevenueRow(row: Pick<WeeklyRevenue, 'notes'>): boolean {
  return (row.notes ?? '').trim().endsWith(INVOICED_TAG)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Week-ending Friday for an ISO date/timestamp. */
const weekEndingOf = (iso: string): string =>
  toISODate(snapToFriday(new Date(`${iso.slice(0, 10)}T00:00:00`)))

/**
 * The desired invoiced rows for one project - pure, testable. One row per issued invoice,
 * placed in the week it was sent (claims: sentAt; stages: invoicedDate). Model resolution
 * mirrors lib/outstandingInvoices: the project's declared pool wins and the other pool only
 * counts when the declared one is empty, so the same work can never appear twice.
 */
export function buildInvoicedRevenueRows(
  project: Project,
  claims: ProgressClaim[],
  stages: ProgressPaymentStage[],
): WeeklyRevenue[] {
  const claimRows: WeeklyRevenue[] = claims
    .filter(c => c.projectId === project.id && (c.status === 'sent' || c.status === 'paid'))
    .map(c => ({
      id: `claiminv-${c.id}`,
      projectId: project.id,
      projectName: project.name,
      entity: project.entity,
      weekEnding: weekEndingOf(c.sentAt ?? c.paidAt ?? c.createdAt),
      weekNumber: 0,
      plannedRevenue: 0,
      actualInvoiced: round2(c.subtotalEx ?? 0),
      isDeposit: false,
      notes: `${c.invoiceNumber} ${INVOICED_TAG}`,
    }))
    .filter(r => r.actualInvoiced > 0)

  const stageRows: WeeklyRevenue[] = stages
    .filter(s => s.projectId === project.id && (s.status === 'invoiced' || s.status === 'paid') && !!s.invoicedDate)
    .map(s => ({
      id: `stageinv-${s.id}`,
      projectId: project.id,
      projectName: project.name,
      entity: project.entity,
      weekEnding: weekEndingOf(s.invoicedDate as string),
      weekNumber: 0,
      plannedRevenue: 0,
      actualInvoiced: round2(s.invoicedAmount ?? s.quotedAmount ?? 0),
      isDeposit: false,
      notes: `${s.invoiceNumber || `Stage ${s.stageNumber}`} ${INVOICED_TAG}`,
    }))
    .filter(r => r.actualInvoiced > 0)

  const model = project.invoiceModel
    ?? (stageRows.length > 0 && claimRows.length === 0 ? 'stage_based' : 'progress_claim')
  const primary = model === 'stage_based' ? stageRows : claimRows
  const secondary = model === 'stage_based' ? claimRows : stageRows
  return primary.length > 0 ? primary : secondary
}

/**
 * Reconcile the project's stored invoiced rows against the current claims/stages: delete
 * tagged rows that no longer correspond to an issued invoice, upsert new/changed ones.
 * Local-first via the storageAsync helpers (localStorage immediately, Supabase in the
 * background). Safe to call after every claim mutation - it no-ops when nothing changed.
 */
export async function syncInvoicedRevenueRows(projectId: string): Promise<void> {
  const project = loadProjects().find(p => p.id === projectId)
  if (!project) return
  const desired = buildInvoicedRevenueRows(
    project,
    loadProgressClaims(projectId),
    loadProgressPaymentStages(projectId),
  )
  const existing = loadWeeklyRevenue().filter(r => r.projectId === projectId && isInvoicedRevenueRow(r))
  const desiredIds = new Set(desired.map(r => r.id))
  for (const row of existing) {
    if (!desiredIds.has(row.id)) await deleteWeeklyRevenueAsync(row.id)
  }
  for (const row of desired) {
    const prev = existing.find(r => r.id === row.id)
    if (prev && prev.weekEnding === row.weekEnding && prev.actualInvoiced === row.actualInvoiced && prev.notes === row.notes) continue
    await upsertRevenue(row)
  }
}
