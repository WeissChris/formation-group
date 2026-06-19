// Outstanding-invoices KPI for the dashboard.
//
// A project bills the client under ONE of two models: stage-based (fg_payment_stages, the Pool
// schedule) or progress claims (fg_progress_claims, the Landscape Operations tab). The dashboard
// used to sum BOTH pools across all projects, so a project that carried an invoiced stage AND a
// sent progress claim (a data-entry slip — the app doesn't stop you creating both) was counted
// twice, inflating receivables. This resolves each project to a single model so the same work can
// never be billed under both, while still preferring whichever pool actually has records (a
// stage-model project that was invoiced via a claim still counts, just not on top of its stages).
//
// Amounts are ex-GST throughout (claims use subtotalEx; stage amounts are ex-GST), matching the
// ex-GST contract values the rest of the app reports. Client invoices pick up GST in Xero.

import type { ProgressPaymentStage, ProgressClaim } from '@/types'

export interface OutstandingProject {
  id: string
  invoiceModel?: 'stage_based' | 'progress_claim'
}

export interface OutstandingInvoices {
  total: number          // ex-GST sum of outstanding invoices across all projects
  projectCount: number   // distinct projects with something outstanding
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** A stage is outstanding when it has been invoiced but nothing has been paid against it. */
export function stageOutstanding(stage: ProgressPaymentStage): number {
  if (stage.status !== 'invoiced' || (stage.paidToDate ?? 0) !== 0) return 0
  // invoicedAmount is the ACTUAL billed amount (partial / negotiated); fall back to the schedule.
  return stage.invoicedAmount ?? stage.quotedAmount ?? 0
}

/** A claim is outstanding once it's sent (issued to the client) and not yet paid. */
export function claimOutstanding(claim: ProgressClaim): number {
  return claim.status === 'sent' ? (claim.subtotalEx ?? 0) : 0
}

export function computeOutstandingInvoices(
  projects: OutstandingProject[],
  stages: ProgressPaymentStage[],
  claims: ProgressClaim[],
): OutstandingInvoices {
  let total = 0
  let projectCount = 0

  for (const p of projects) {
    const stageSum = stages.filter(s => s.projectId === p.id).reduce((s, x) => s + stageOutstanding(x), 0)
    const claimSum = claims.filter(c => c.projectId === p.id).reduce((s, c) => s + claimOutstanding(c), 0)

    // Resolve the project's model so the SAME project can't be billed under both pools. Prefer the
    // declared invoiceModel; for legacy projects with no model, infer from which pool has records.
    const model = p.invoiceModel ?? (stageSum > 0 && claimSum === 0 ? 'stage_based' : 'progress_claim')
    const primary = model === 'stage_based' ? stageSum : claimSum
    const secondary = model === 'stage_based' ? claimSum : stageSum
    // Use the model's own pool; only fall back to the other pool when the model's pool is empty, so
    // a mis-modelled project still surfaces its real invoices but is never double-counted.
    const amount = primary > 0 ? primary : secondary

    if (amount > 0) {
      total += amount
      projectCount += 1
    }
  }

  return { total: round2(total), projectCount }
}
