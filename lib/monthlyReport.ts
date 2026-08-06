// Monthly finance report - pure month-slicing helpers (client-safe, unit tested).
//
// The /reports/monthly page assembles one InvoicedItem list from the two real billing sources:
// claim-written actualInvoiced revenue rows (dated by week-ending Friday) and Xero-direct sales
// invoices the claims don't cover (dated by invoice date, already deduped via lib/xeroSales).
// These helpers slice that list by calendar month for the month tiles and the trend strip.

import type { CompanyPnlMonth } from './companyPnl'

export type ReportEntity = 'formation' | 'lume' | 'design'

export interface InvoicedItem {
  entity: ReportEntity
  /** ISO date the dollars belong to (week-ending Friday for claims, invoice date for Xero). */
  dateIso: string
  amount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** First-of-month ISO ('2026-08-01') for a Date. */
export function monthIsoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Shift a first-of-month ISO by n months (n may be negative). */
export function addMonths(monthIso: string, n: number): string {
  const [y, m] = monthIso.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthIsoOf(d)
}

/** 'August 2026' for a first-of-month ISO. */
export function monthLabel(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

/** True when dateIso falls inside the calendar month of monthIso. */
export function inMonth(dateIso: string, monthIso: string): boolean {
  return dateIso.slice(0, 7) === monthIso.slice(0, 7)
}

export interface MonthlyInvoiced {
  total: number
  byEntity: Record<ReportEntity, number>
}

export function monthlyInvoiced(items: InvoicedItem[], monthIso: string): MonthlyInvoiced {
  const byEntity: Record<ReportEntity, number> = { formation: 0, lume: 0, design: 0 }
  let total = 0
  for (const it of items) {
    if (!it.dateIso || !inMonth(it.dateIso, monthIso)) continue
    const amt = Number(it.amount) || 0
    byEntity[it.entity] = round2(byEntity[it.entity] + amt)
    total = round2(total + amt)
  }
  return { total, byEntity }
}

/** Month totals for the trailing window ENDING at monthIso (inclusive), oldest first. */
export function invoicedTrend(items: InvoicedItem[], monthIso: string, monthsBack = 6): Array<{ monthIso: string; total: number }> {
  const out: Array<{ monthIso: string; total: number }> = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const m = addMonths(monthIso, -i)
    out.push({ monthIso: m, total: monthlyInvoiced(items, m).total })
  }
  return out
}

export interface PnlTotals {
  revenue: number
  costOfSales: number
  grossProfit: number
  overheads: number
  netProfit: number
}

const zeroPnl = (): PnlTotals => ({ revenue: 0, costOfSales: 0, grossProfit: 0, overheads: 0, netProfit: 0 })

function addPnl(acc: PnlTotals, m: CompanyPnlMonth): void {
  acc.revenue = round2(acc.revenue + m.revenue)
  acc.costOfSales = round2(acc.costOfSales + m.costOfSales)
  acc.grossProfit = round2(acc.grossProfit + m.grossProfit)
  acc.overheads = round2(acc.overheads + m.overheads)
  acc.netProfit = round2(acc.netProfit + m.netProfit)
}

/** Sum of P&L months for one calendar month across entities. Null when the month isn't synced. */
export function pnlMonthTotals(months: CompanyPnlMonth[], monthIso: string): PnlTotals | null {
  const rows = months.filter(m => m.month === monthIso)
  if (rows.length === 0) return null
  const acc = zeroPnl()
  rows.forEach(m => addPnl(acc, m))
  return acc
}

/** FY-to-date P&L totals: July of the FY through the reported month (inclusive). */
export function pnlFyTotals(months: CompanyPnlMonth[], fyStartYear: number, throughMonthIso: string): PnlTotals | null {
  const fromIso = `${fyStartYear}-07-01`
  const rows = months.filter(m => m.month >= fromIso && m.month <= throughMonthIso)
  if (rows.length === 0) return null
  const acc = zeroPnl()
  rows.forEach(m => addPnl(acc, m))
  return acc
}
