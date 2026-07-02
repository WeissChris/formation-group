// Foreman delivery scorecard — turns a job's budget vs actuals into the controllable levers a site
// supervisor can move (labour, materials, subbies) plus one overall delivery SCORE that feeds the group
// bonus. The foreman never sees a raw GP% or contract margin; they see progress bars + a colour + a score.
//
// Budgets come from the accepted estimate (cost allowances, ex-markup). Actuals come from the foreman's
// weekly cost log (supply $ + labour $) and the committed subcontractor packages. "Expected to date" is
// scaled by SCHEDULE PROGRESS (planned cost elapsed on the gantt), so spending is judged against how far
// the job has actually come — not against the whole budget on day one.
//
// NOTE: labour actual is $ today (the weekly log). When Xero timesheets land, swap the labour lever's
// budget+actual to HOURS (allowed hours = estimateLabourHours) — the maths below is unit-agnostic.

import type { Estimate, WeeklyActual, SubcontractorPackage, GanttEntry } from '@/types'
import { activeLineItems, costBreakdown } from './estimateCalculations'
import { entrySegments } from './ganttForecast'
import { workingDaysBetween } from './ganttSchedule'

export type ScoreStatus = 'good' | 'watch' | 'over' | 'na'

export interface ScorecardLever {
  key: 'labour' | 'materials' | 'subbies'
  label: string
  budget: number        // allowed cost ($)
  actual: number        // to-date / committed ($)
  consumedPct: number   // actual / budget (0..n); 0 when no budget
  status: ScoreStatus
}

export interface Scorecard {
  progressPct: number          // 0..1 — schedule progress (planned cost elapsed)
  levers: ScorecardLever[]
  score: number | null         // 0-120 delivery index (100 = on budget); null when too early to judge
  status: ScoreStatus          // overall colour
  budgetCost: number           // total allowed cost
  projectedCost: number        // projected final cost at current run-rate
  hasBudget: boolean
}

// Below this schedule progress there isn't enough signal to score — actuals lag and tiny denominators
// make ratios wild. We still show the levers, but the overall score reads "too early".
const MIN_PROGRESS_TO_SCORE = 0.08

/** Fraction of a segment's cost that has elapsed by `today` (working-day based, 0..1). */
export function segmentElapsed(startIso: string, endIso: string, today: string): number {
  if (!startIso || !endIso) return 0
  if (today < startIso) return 0
  if (today >= endIso) return 1
  const total = workingDaysBetween(startIso, endIso)
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, workingDaysBetween(startIso, today) / total))
}

/** Schedule progress 0..1 = planned cost elapsed / total planned cost across every scheduled bar. */
export function scheduleProgress(gantt: GanttEntry[], today: string): number {
  let total = 0, done = 0
  for (const e of gantt) {
    for (const s of entrySegments(e)) {
      const c = s.costAllocation || 0
      if (c <= 0 || !s.startDate || !s.endDate) continue
      total += c
      done += c * segmentElapsed(s.startDate, s.endDate, today)
    }
  }
  return total > 0 ? done / total : 0
}

/** A run-rate lever (labour/materials) is judged by how its consumption compares to progress. */
function leverStatus(budget: number, consumedPct: number, progress: number): ScoreStatus {
  if (budget <= 0) return 'na'
  if (progress < 0.05 && consumedPct < 0.05) return 'na'   // nothing meaningful yet
  const ahead = consumedPct - progress                      // spending faster than progressing
  if (ahead <= 0.05) return 'good'
  if (ahead <= 0.15) return 'watch'
  return 'over'
}

/** Subbies are COMMITTED up-front (the whole package counts on day one), so they are judged straight
 *  against the allowance — committed == budget is ON budget, not "spent it all already". */
function committedStatus(budget: number, consumedPct: number): ScoreStatus {
  if (budget <= 0) return 'na'
  if (consumedPct <= 0) return 'na'          // nothing committed yet
  if (consumedPct <= 1.02) return 'good'     // small tolerance for rounding
  if (consumedPct <= 1.1) return 'watch'
  return 'over'
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }

export interface ScorecardInput {
  estimate: Estimate | null
  actuals: WeeklyActual[]
  subbies: SubcontractorPackage[]
  gantt: GanttEntry[]
  today: string   // ISO date
}

export function computeScorecard({ estimate, actuals, subbies, gantt, today }: ScorecardInput): Scorecard {
  const items = estimate ? activeLineItems(estimate) : []
  const b = costBreakdown(items)
  const budgetMaterials = b.material + b.equipment   // supply-type spend the foreman logs together
  const budgetLabour = b.labour
  const budgetSubbies = b.subcontractor
  const budgetCost = budgetMaterials + budgetLabour + budgetSubbies

  const actMaterials = actuals.reduce((s, a) => s + (a.supplyCost || 0), 0)
  const actLabour = actuals.reduce((s, a) => s + (a.labourCost || 0), 0)
  const committedSubbies = subbies.reduce((s, p) => s + (p.approvedValue || 0) + (p.variations || 0), 0)

  const progress = scheduleProgress(gantt, today)

  const mkLever = (
    key: ScorecardLever['key'], label: string, budget: number, actual: number,
  ): ScorecardLever => {
    const consumedPct = budget > 0 ? actual / budget : 0
    return { key, label, budget, actual, consumedPct, status: leverStatus(budget, consumedPct, progress) }
  }

  const subConsumed = budgetSubbies > 0 ? committedSubbies / budgetSubbies : 0
  const levers: ScorecardLever[] = [
    mkLever('labour', 'Labour', budgetLabour, actLabour),
    mkLever('materials', 'Materials', budgetMaterials, actMaterials),
    { key: 'subbies', label: 'Subcontractors', budget: budgetSubbies, actual: committedSubbies,
      consumedPct: subConsumed, status: committedStatus(budgetSubbies, subConsumed) },
  ]

  // Projected final cost. Labour + materials extrapolate from the run-rate (actual / progress);
  // subbies are committed up-front so their projected final IS what's been committed (or the budget
  // if nothing committed yet). With too little progress we assume a lever lands on budget.
  const runRate = (actual: number, budget: number) =>
    progress >= MIN_PROGRESS_TO_SCORE && actual > 0 ? actual / progress : budget
  const projectedCost =
    runRate(actLabour, budgetLabour) +
    runRate(actMaterials, budgetMaterials) +
    (committedSubbies > 0 ? committedSubbies : budgetSubbies)

  const hasBudget = budgetCost > 0
  let score: number | null = null
  let status: ScoreStatus = 'na'
  if (hasBudget && progress >= MIN_PROGRESS_TO_SCORE) {
    // 100 = projected exactly on budget; >100 = coming in under; <100 = over. Clamped to a sane band.
    score = Math.round(clamp(100 * budgetCost / Math.max(projectedCost, 1), 40, 120))
    status = score >= 100 ? 'good' : score >= 88 ? 'watch' : 'over'
  }

  return { progressPct: progress, levers, score, status, budgetCost, projectedCost, hasBudget }
}
