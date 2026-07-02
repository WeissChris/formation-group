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
import { activeLineItems, costBreakdown, STD_LABOUR_RATE } from './estimateCalculations'
import { entrySegments, entryClaimSegments, type CostTypeKey } from './ganttForecast'
import { workingDaysBetween } from './ganttSchedule'

export type ScoreStatus = 'good' | 'watch' | 'over' | 'na'

export interface ScorecardLever {
  key: 'labour' | 'materials' | 'subbies'
  label: string
  budget: number        // allowed cost ($)
  actual: number        // to-date / committed ($)
  consumedPct: number   // actual / budget (0..n); 0 when no budget
  /** How far THIS lever's own scheduled work has elapsed (0..1) - the fair comparison base.
   *  Labour used is judged against labour-work elapsed, not the whole job (a subbie-heavy
   *  early schedule made 28% labour look like a huge under-run at "68% progress"). */
  progressPct: number
  status: ScoreStatus
}

export interface SchedulePenalty {
  baselineEnd: string
  forecastEnd: string
  overrunDays: number          // working days past the ORIGINAL baseline completion (0 = on/under)
  overrunPct: number           // overrunDays / baseline working-day duration
  penalty: number              // points deducted from the cost score (0..SCHEDULE_PENALTY_CAP)
}

export interface Scorecard {
  progressPct: number          // 0..1 — schedule progress (planned cost elapsed)
  levers: ScorecardLever[]
  score: number | null         // 0-120 delivery index (100 = on budget); null when too early to judge
  costScore: number | null     // the score BEFORE the schedule penalty (cost efficiency only)
  schedule: SchedulePenalty | null   // null when no baseline anchor was supplied
  status: ScoreStatus          // overall colour
  budgetCost: number           // total allowed cost
  projectedCost: number        // projected final cost at current run-rate
  hasBudget: boolean
}

// Below this schedule progress there isn't enough signal to score — actuals lag and tiny denominators
// make ratios wild. We still show the levers, but the overall score reads "too early".
const MIN_PROGRESS_TO_SCORE = 0.08

// ── Schedule (timeline-creep) penalty ─────────────────────────────────────────
// Cost levers run against the LIVE gantt (honest cost efficiency for resequenced work), but the
// live gantt can't see creep — a foreman who keeps nudging bars right is always "on schedule" by
// his own definition. So the score also carries a penalty vs the ORIGINAL plan (the FIRST
// baseline), weighted by the job's length (Chris): the measure is % overrun of the baseline
// duration, so a week over a 3-week job (~33%) hurts far more than a week over a 3-month job
// (~8%, inside the grace). 10% overrun is free; beyond it, 1 point per 1%, capped.
const SCHEDULE_GRACE_PCT = 0.10
const SCHEDULE_PENALTY_CAP = 25

/** The schedule penalty for a forecast finish vs the original baseline. Pure — tested. */
export function schedulePenalty(
  baselineEnd: string, baselineDurationDays: number, forecastEnd: string,
): SchedulePenalty {
  let overrunDays = 0
  if (forecastEnd > baselineEnd) {
    // workingDaysBetween is inclusive of both ends; the overrun excludes the baseline day itself.
    overrunDays = Math.max(0, workingDaysBetween(baselineEnd, forecastEnd) - 1)
  }
  const overrunPct = baselineDurationDays > 0 ? overrunDays / baselineDurationDays : 0
  const penalty = Math.min(SCHEDULE_PENALTY_CAP, Math.max(0, Math.round((overrunPct - SCHEDULE_GRACE_PCT) * 100)))
  return { baselineEnd, forecastEnd, overrunDays, overrunPct, penalty }
}

/** Fraction of a segment's cost that has elapsed by `today` (working-day based, 0..1). */
export function segmentElapsed(startIso: string, endIso: string, today: string): number {
  if (!startIso || !endIso) return 0
  if (today < startIso) return 0
  if (today >= endIso) return 1
  const total = workingDaysBetween(startIso, endIso)
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, workingDaysBetween(startIso, today) / total))
}

/**
 * Schedule progress for ONE discipline group: elapsed cost allocation / total cost allocation
 * across the claims whose costType is in `kinds`. Uses entryClaimSegments so split type-lines
 * carry their discipline; unsplit own-bars (no costType) are blended and excluded here.
 * Returns null when the discipline has no dated, costed claims - caller falls back to blended.
 */
export function disciplineProgress(gantt: GanttEntry[], today: string, kinds: CostTypeKey[]): number | null {
  let total = 0, done = 0
  for (const e of gantt) {
    for (const { costType, seg } of entryClaimSegments(e)) {
      if (!costType || !kinds.includes(costType)) continue
      const c = seg.costAllocation || 0
      if (c <= 0 || !seg.startDate || !seg.endDate) continue
      total += c
      done += c * segmentElapsed(seg.startDate, seg.endDate, today)
    }
  }
  return total > 0 ? done / total : null
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
  /** REAL logged hours from Xero timesheets (fg_xero_project_hours). When present (non-null),
   *  the labour lever runs on these instead of the $-derived fallback: the hours are valued at
   *  STD_LABOUR_RATE, so lever %, projection and the score all measure hours used vs allowed
   *  (allowance = labour budget / rate = estimateLabourHours). Null = not synced yet. */
  actualLabourHours?: number | null
  /** Supply spend to date from the Xero cost feed (fg_xero_project_costs minus labour/subbie
   *  accounts). When present (non-null) the materials lever runs on it instead of the retired
   *  foreman cost log (fg_actuals), which nothing feeds any more. Null = not synced yet. */
  actualSupplyCost?: number | null
  /** The ORIGINAL plan anchor (the FIRST gantt baseline): its completion date + working-day
   *  duration. When present, timeline creep deducts from the score (schedulePenalty). */
  baseline?: { endDate: string; durationDays: number } | null
}

export function computeScorecard({ estimate, actuals, subbies, gantt, today, actualLabourHours, actualSupplyCost, baseline }: ScorecardInput): Scorecard {
  const items = estimate ? activeLineItems(estimate) : []
  const b = costBreakdown(items)
  const budgetMaterials = b.material + b.equipment   // supply-type spend the foreman logs together
  const budgetLabour = b.labour
  const budgetSubbies = b.subcontractor
  const budgetCost = budgetMaterials + budgetLabour + budgetSubbies

  // Materials actual: Xero supply spend when synced, else the legacy logged-$ fallback.
  const actMaterials = actualSupplyCost != null
    ? actualSupplyCost
    : actuals.reduce((s, a) => s + (a.supplyCost || 0), 0)
  // Labour actual: real timesheet hours at the costed rate when synced, else the logged-$ fallback.
  const actLabour = actualLabourHours != null
    ? actualLabourHours * STD_LABOUR_RATE
    : actuals.reduce((s, a) => s + (a.labourCost || 0), 0)
  const committedSubbies = subbies.reduce((s, p) => s + (p.approvedValue || 0) + (p.variations || 0), 0)

  const progress = scheduleProgress(gantt, today)
  // Per-discipline progress: labour used is judged against LABOUR-work elapsed (and materials
  // against supply-work elapsed), not the blended job progress - on a subbie-heavy early
  // schedule the blended figure runs way ahead of the labour programme, which made low labour
  // usage look like a massive under-run and pinned the score at its ceiling. Falls back to the
  // blended figure when a discipline has no typed, dated claims (rare - categories auto-split).
  const labourProgress = disciplineProgress(gantt, today, ['labour']) ?? progress
  const materialsProgress = disciplineProgress(gantt, today, ['material', 'equipment']) ?? progress

  const mkLever = (
    key: ScorecardLever['key'], label: string, budget: number, actual: number, leverProgress: number,
  ): ScorecardLever => {
    const consumedPct = budget > 0 ? actual / budget : 0
    return { key, label, budget, actual, consumedPct, progressPct: leverProgress, status: leverStatus(budget, consumedPct, leverProgress) }
  }

  const subConsumed = budgetSubbies > 0 ? committedSubbies / budgetSubbies : 0
  const levers: ScorecardLever[] = [
    mkLever('labour', 'Labour', budgetLabour, actLabour, labourProgress),
    mkLever('materials', 'Materials', budgetMaterials, actMaterials, materialsProgress),
    { key: 'subbies', label: 'Subcontractors', budget: budgetSubbies, actual: committedSubbies,
      consumedPct: subConsumed, progressPct: 1, status: committedStatus(budgetSubbies, subConsumed) },
  ]

  // Projected final cost. Labour + materials extrapolate from the run-rate against THEIR OWN
  // discipline's elapsed schedule (actual / disciplineProgress); subbies are committed up-front
  // so their projected final IS what's been committed (or the budget if nothing committed yet).
  // With too little of a discipline elapsed we assume it lands on budget.
  const runRate = (actual: number, budget: number, leverProgress: number) =>
    leverProgress >= MIN_PROGRESS_TO_SCORE && actual > 0 ? actual / leverProgress : budget
  const projectedCost =
    runRate(actLabour, budgetLabour, labourProgress) +
    runRate(actMaterials, budgetMaterials, materialsProgress) +
    (committedSubbies > 0 ? committedSubbies : budgetSubbies)

  // Timeline creep vs the ORIGINAL baseline (forecast finish = the live gantt's latest bar end).
  let schedule: SchedulePenalty | null = null
  if (baseline?.endDate && baseline.durationDays > 0) {
    let forecastEnd = ''
    for (const e of gantt) for (const s of entrySegments(e)) {
      if (s.endDate && s.endDate > forecastEnd) forecastEnd = s.endDate
    }
    if (forecastEnd) schedule = schedulePenalty(baseline.endDate, baseline.durationDays, forecastEnd)
  }

  const hasBudget = budgetCost > 0
  let score: number | null = null
  let costScore: number | null = null
  let status: ScoreStatus = 'na'
  if (hasBudget && progress >= MIN_PROGRESS_TO_SCORE) {
    // 100 = projected exactly on budget; >100 = coming in under; <100 = over. Clamped to a sane band.
    costScore = Math.round(clamp(100 * budgetCost / Math.max(projectedCost, 1), 40, 120))
    score = Math.round(clamp(costScore - (schedule?.penalty ?? 0), 40, 120))
    status = score >= 100 ? 'good' : score >= 88 ? 'watch' : 'over'
  }

  return { progressPct: progress, levers, score, costScore, schedule, status, budgetCost, projectedCost, hasBudget }
}
