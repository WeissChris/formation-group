// Unbilled work - "earned but not invoiced". The gantt says what each job is worth up to the
// end of this week (the same planned-to-date maths the claim prefill uses); anything above
// what has actually been invoiced (sent/paid claims) is completed work sitting unclaimed.
// The reverse (invoiced ahead of the programme - deposits, forward claims) is overBilled.

import { plannedToDateByCategory } from './ganttForecast'
import { snapToFriday, toISODate } from './utils'
import type { GanttEntry, ProgressClaim } from '@/types'

export interface UnbilledWork {
  earnedToDate: number
  invoicedToDate: number
  /** Earned above invoiced, floored at 0 - money on the table. */
  unbilled: number
  /** Invoiced above earned, floored at 0 - billed ahead of the work (deposits etc). */
  overBilled: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeUnbilledWork(
  entries: GanttEntry[],
  claims: ProgressClaim[],
  todayIso: string,
): UnbilledWork {
  const fri = toISODate(snapToFriday(new Date(`${todayIso}T00:00:00`)))
  let earned = 0
  plannedToDateByCategory(entries, fri).forEach(v => { earned += v })
  const invoiced = claims
    .filter(c => c.status === 'sent' || c.status === 'paid')
    .reduce((s, c) => s + (c.subtotalEx ?? 0), 0)
  const diff = earned - invoiced
  return {
    earnedToDate: round2(earned),
    invoicedToDate: round2(invoiced),
    unbilled: round2(Math.max(0, diff)),
    overBilled: round2(Math.max(0, -diff)),
  }
}
