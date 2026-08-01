// 13-week cash flow - the forward cash picture, v1. Pure and unit tested; the /company page
// assembles the inputs.
//
// Cash in:  outstanding sent invoices land at sent date + the receipt lag (overdue ones land
//           in week 1); future planned revenue (the gantt-driven invoice schedule) lands at
//           its invoice week + the same lag.
// Cash out: the gantt's scheduled cost in its week, plus the overhead run-rate every week.
//
// Deliberately simple v1: ex-GST throughout (like the rest of the app), no BAS/tax cycles,
// receipt lag from actual days-to-pay history (fallback 14 days). The caption says so.

import { snapToFriday, toISODate } from './utils'

export interface CashflowWeek {
  friIso: string
  inflow: number
  outflow: number
  net: number
  cumulative: number
}

export interface CashflowInputs {
  todayIso: string
  weeks?: number                                            // default 13
  /** Sent, unpaid invoices: when they went out and for how much (ex GST). */
  outstandingInvoices: Array<{ sentIso: string; amount: number }>
  /** Future planned revenue rows (invoice weeks) - weekEnding Friday + amount. */
  plannedRevenue: Array<{ weekEnding: string; amount: number }>
  /** Scheduled cost rows (money out) - weekEnding Friday + amount. */
  scheduledCosts: Array<{ weekEnding: string; amount: number }>
  /** Overhead run-rate per week (monthly overheads * 12 / 52). */
  weeklyOverheads: number
  /** Days from invoice to cash, from real payment history. */
  receiptLagDays: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const DAY_MS = 24 * 60 * 60 * 1000

const fridayOf = (iso: string): string => toISODate(snapToFriday(new Date(`${iso.slice(0, 10)}T00:00:00`)))

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return toISODate(new Date(d.getTime() + days * DAY_MS))
}

export function computeCashflow(inputs: CashflowInputs): CashflowWeek[] {
  const weeks = inputs.weeks ?? 13
  const startFri = fridayOf(inputs.todayIso)
  const fridays: string[] = []
  for (let i = 0; i < weeks; i++) fridays.push(addDays(startFri, i * 7))
  const index = new Map(fridays.map((f, i) => [f, i]))

  const inflow = new Array<number>(weeks).fill(0)
  const outflow = new Array<number>(weeks).fill(0)

  // Outstanding invoices: expected receipt = sent + lag; already-due money lands in week 1.
  for (const inv of inputs.outstandingInvoices) {
    if (inv.amount <= 0) continue
    const dueFri = fridayOf(addDays(inv.sentIso, inputs.receiptLagDays))
    const i = dueFri < startFri ? 0 : index.get(dueFri)
    if (i !== undefined) inflow[i] += inv.amount
  }

  // Planned invoicing: receipt = invoice week + lag. Anything expected beyond the horizon
  // simply falls off the end (it is future working capital, not this quarter's cash).
  for (const row of inputs.plannedRevenue) {
    if (row.amount <= 0) continue
    const invoiceFri = fridayOf(row.weekEnding)
    if (invoiceFri < startFri) continue   // past planned rows are history, not receipts
    const dueFri = fridayOf(addDays(invoiceFri, inputs.receiptLagDays))
    const i = index.get(dueFri)
    if (i !== undefined) inflow[i] += row.amount
  }

  for (const row of inputs.scheduledCosts) {
    if (row.amount <= 0) continue
    const i = index.get(fridayOf(row.weekEnding))
    if (i !== undefined) outflow[i] += row.amount
  }

  let cumulative = 0
  return fridays.map((friIso, i) => {
    const out = outflow[i] + inputs.weeklyOverheads
    const net = inflow[i] - out
    cumulative += net
    return {
      friIso,
      inflow: round2(inflow[i]),
      outflow: round2(out),
      net: round2(net),
      cumulative: round2(cumulative),
    }
  })
}
