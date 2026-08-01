// Portfolio cost consumption by discipline - "where do we bleed: labour, materials or
// subbies?". Compares each discipline's share of budget consumed against the portfolio's
// billing progress: a discipline running well ahead of % billed is running hot.
// Budget comes from the accepted estimates (costBreakdown); actuals from the Xero feed's
// per-discipline split. Pure and unit tested.

export interface DisciplineJobInput {
  /** Budget by discipline from the accepted estimates (materials includes equipment). */
  budgetLabour: number
  budgetMaterials: number
  budgetSubbies: number
  /** Actual spend by discipline (Xero). Null when the job has no live cost data - skipped. */
  actualLabour: number | null
  actualMaterials: number | null
  actualSubbies: number | null
  /** % of contract billed - the progress reference. */
  pctBilled: number
  forecastRevenue: number
}

export interface DisciplineConsumption {
  key: 'labour' | 'materials' | 'subbies'
  label: string
  budget: number
  actual: number
  /** actual / budget as %, null when no budget. */
  consumedPct: number | null
}

export interface DisciplineSummary {
  jobsIncluded: number
  /** Revenue-weighted average % billed across included jobs - the progress yardstick. */
  avgPctBilled: number
  rows: DisciplineConsumption[]
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function computeDisciplineConsumption(jobs: DisciplineJobInput[]): DisciplineSummary {
  const live = jobs.filter(j => j.actualLabour !== null)
  const totals = {
    labour: { budget: 0, actual: 0 },
    materials: { budget: 0, actual: 0 },
    subbies: { budget: 0, actual: 0 },
  }
  let revSum = 0
  let billedWeighted = 0
  for (const j of live) {
    totals.labour.budget += j.budgetLabour
    totals.labour.actual += j.actualLabour ?? 0
    totals.materials.budget += j.budgetMaterials
    totals.materials.actual += j.actualMaterials ?? 0
    totals.subbies.budget += j.budgetSubbies
    totals.subbies.actual += j.actualSubbies ?? 0
    revSum += j.forecastRevenue
    billedWeighted += j.pctBilled * j.forecastRevenue
  }
  const rows: DisciplineConsumption[] = ([
    ['labour', 'Labour'],
    ['materials', 'Materials & equipment'],
    ['subbies', 'Subcontractors'],
  ] as const).map(([key, label]) => ({
    key,
    label,
    budget: round2(totals[key].budget),
    actual: round2(totals[key].actual),
    consumedPct: totals[key].budget > 0 ? round1((totals[key].actual / totals[key].budget) * 100) : null,
  }))
  return {
    jobsIncluded: live.length,
    avgPctBilled: revSum > 0 ? round1(billedWeighted / revSum) : 0,
    rows,
  }
}
