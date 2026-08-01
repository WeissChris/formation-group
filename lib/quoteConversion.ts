// Formation quote conversion - the top of the funnel for the main business. Design proposals
// already have a win rate on the dashboard; base estimates had nothing. Measures the last 12
// months (by sentAt): what went out, what was won (count and value-weighted), and how long
// clients take to decide. Variations are excluded - they are post-sale.

import type { Estimate } from '@/types'
import { getEstimateTotals } from './estimateCalculations'

export interface QuoteConversion {
  sentCount: number
  sentValue: number
  acceptedCount: number
  acceptedValue: number
  declinedCount: number
  pendingCount: number
  pendingValue: number
  /** accepted / decided (accepted + declined), by count. Null with nothing decided. */
  winRatePct: number | null
  /** acceptedValue / sentValue - the value-weighted conversion. Null with nothing sent. */
  valueConversionPct: number | null
  /** Mean days from sent to a decision (accept or decline). Null with no sample. */
  avgDaysToDecision: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
const DAY_MS = 24 * 60 * 60 * 1000

export function computeQuoteConversion(
  estimates: Estimate[],
  todayIso: string,
  windowDays = 365,
): QuoteConversion {
  const cutoff = new Date(todayIso.slice(0, 10)).getTime() - windowDays * DAY_MS
  // Base estimates only, sent within the window. Archived ones still count - a declined
  // quote being tidied away must not flatter the win rate.
  const sent = estimates.filter(e =>
    !e.parentEstimateId && e.sentAt && new Date(e.sentAt).getTime() >= cutoff)

  const accepted = sent.filter(e => e.status === 'accepted')
  const declined = sent.filter(e => !!e.declinedAt || e.status === 'declined')
  const pending = sent.filter(e => !accepted.includes(e) && !declined.includes(e))

  const value = (list: Estimate[]) => round2(list.reduce((s, e) => s + getEstimateTotals(e).totalRevenue, 0))
  const sentValue = value(sent)
  const acceptedValue = value(accepted)

  const decisionDays: number[] = []
  for (const e of sent) {
    const decidedAt = e.status === 'accepted' ? e.acceptedAt : e.declinedAt
    if (!decidedAt || !e.sentAt) continue
    const d = (new Date(decidedAt).getTime() - new Date(e.sentAt).getTime()) / DAY_MS
    if (d >= 0) decisionDays.push(d)
  }

  const decided = accepted.length + declined.length
  return {
    sentCount: sent.length,
    sentValue,
    acceptedCount: accepted.length,
    acceptedValue,
    declinedCount: declined.length,
    pendingCount: pending.length,
    pendingValue: value(pending),
    winRatePct: decided > 0 ? round1((accepted.length / decided) * 100) : null,
    valueConversionPct: sentValue > 0 ? round1((acceptedValue / sentValue) * 100) : null,
    avgDaysToDecision: decisionDays.length > 0
      ? Math.round(decisionDays.reduce((s, d) => s + d, 0) / decisionDays.length)
      : null,
  }
}
