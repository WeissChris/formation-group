// Debtor ageing + days-to-pay - who owes what, for how long, and how fast clients actually
// pay. Built from the app's own claim/stage records (sentAt / paidAt / invoicedDate); model
// resolution per project mirrors lib/outstandingInvoices so stage-and-claim double entry can
// never double-count. Amounts ex GST, matching the rest of the app.

import type { Project, ProgressClaim, ProgressPaymentStage } from '@/types'

export interface DebtorInvoice {
  projectId: string
  projectName: string
  clientName: string
  invoiceNumber: string
  amount: number
  sentIso: string          // YYYY-MM-DD the invoice went out
  daysOutstanding: number
}

export interface AgeingBucket { label: string; amount: number; count: number }

export interface DebtorSummary {
  totalOutstanding: number
  buckets: AgeingBucket[]              // fixed order: 0-14, 15-30, 31-60, 61+
  invoices: DebtorInvoice[]            // oldest first
  /** Mean sent->paid days across claims paid in the last 12 months. Null with no sample. */
  avgDaysToPay: number | null
  paidSample: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.max(0, Math.round((new Date(toIso.slice(0, 10)).getTime() - new Date(fromIso.slice(0, 10)).getTime()) / DAY_MS))

export function computeDebtors(
  projects: Pick<Project, 'id' | 'name' | 'clientName' | 'invoiceModel'>[],
  claims: ProgressClaim[],
  stages: ProgressPaymentStage[],
  todayIso: string,
): DebtorSummary {
  const invoices: DebtorInvoice[] = []

  for (const p of projects) {
    const claimRows = claims
      .filter(c => c.projectId === p.id && c.status === 'sent' && (c.subtotalEx ?? 0) > 0 && c.sentAt)
      .map(c => ({
        projectId: p.id, projectName: p.name, clientName: p.clientName || '',
        invoiceNumber: c.invoiceNumber, amount: round2(c.subtotalEx),
        sentIso: (c.sentAt as string).slice(0, 10),
        daysOutstanding: daysBetween(c.sentAt as string, todayIso),
      }))
    const stageRows = stages
      .filter(s => s.projectId === p.id && s.status === 'invoiced' && (s.paidToDate ?? 0) === 0 && s.invoicedDate)
      .map(s => ({
        projectId: p.id, projectName: p.name, clientName: p.clientName || '',
        invoiceNumber: s.invoiceNumber || `Stage ${s.stageNumber}`,
        amount: round2(s.invoicedAmount ?? s.quotedAmount ?? 0),
        sentIso: (s.invoicedDate as string).slice(0, 10),
        daysOutstanding: daysBetween(s.invoicedDate as string, todayIso),
      }))
      .filter(r => r.amount > 0)

    // One billing model per project (same rule as the outstanding-invoices KPI).
    const model = p.invoiceModel ?? (stageRows.length > 0 && claimRows.length === 0 ? 'stage_based' : 'progress_claim')
    const primary = model === 'stage_based' ? stageRows : claimRows
    const secondary = model === 'stage_based' ? claimRows : stageRows
    invoices.push(...(primary.length > 0 ? primary : secondary))
  }

  invoices.sort((a, b) => b.daysOutstanding - a.daysOutstanding)

  const bucketDefs: Array<{ label: string; min: number; max: number }> = [
    { label: '0-14 days', min: 0, max: 14 },
    { label: '15-30 days', min: 15, max: 30 },
    { label: '31-60 days', min: 31, max: 60 },
    { label: '61+ days', min: 61, max: Infinity },
  ]
  const buckets = bucketDefs.map(d => {
    const rows = invoices.filter(i => i.daysOutstanding >= d.min && i.daysOutstanding <= d.max)
    return { label: d.label, amount: round2(rows.reduce((s, r) => s + r.amount, 0)), count: rows.length }
  })

  // Days-to-pay sample: claims paid in the last 12 months with both stamps.
  const yearAgoMs = new Date(todayIso.slice(0, 10)).getTime() - 365 * DAY_MS
  const paid = claims.filter(c =>
    c.status === 'paid' && c.sentAt && c.paidAt && new Date(c.paidAt).getTime() >= yearAgoMs)
  const avgDaysToPay = paid.length > 0
    ? Math.round(paid.reduce((s, c) => s + daysBetween(c.sentAt as string, c.paidAt as string), 0) / paid.length)
    : null

  return {
    totalOutstanding: round2(invoices.reduce((s, i) => s + i.amount, 0)),
    buckets,
    invoices,
    avgDaysToPay,
    paidSample: paid.length,
  }
}
