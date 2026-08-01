import { describe, it, expect } from 'vitest'
import { computeDisciplineConsumption, type DisciplineJobInput } from './disciplineCosts'

const job = (over: Partial<DisciplineJobInput> = {}): DisciplineJobInput => ({
  budgetLabour: 40_000, budgetMaterials: 30_000, budgetSubbies: 30_000,
  actualLabour: 30_000, actualMaterials: 12_000, actualSubbies: 6_000,
  pctBilled: 50, forecastRevenue: 200_000,
  ...over,
})

describe('computeDisciplineConsumption', () => {
  it('sums budget vs actual per discipline and derives consumption %', () => {
    const s = computeDisciplineConsumption([job(), job()])
    const labour = s.rows.find(r => r.key === 'labour')!
    expect(labour.budget).toBe(80_000)
    expect(labour.actual).toBe(60_000)
    expect(labour.consumedPct).toBe(75)      // hot: 75% used at 50% billed
    expect(s.avgPctBilled).toBe(50)
    expect(s.jobsIncluded).toBe(2)
  })

  it('skips jobs with no live cost data', () => {
    const s = computeDisciplineConsumption([job(), job({ actualLabour: null, actualMaterials: null, actualSubbies: null })])
    expect(s.jobsIncluded).toBe(1)
    expect(s.rows.find(r => r.key === 'labour')!.actual).toBe(30_000)
  })

  it('null consumption when a discipline has no budget', () => {
    const s = computeDisciplineConsumption([job({ budgetSubbies: 0, actualSubbies: 5_000 })])
    expect(s.rows.find(r => r.key === 'subbies')!.consumedPct).toBeNull()
  })

  it('revenue-weights the billed reference', () => {
    const s = computeDisciplineConsumption([
      job({ pctBilled: 20, forecastRevenue: 100_000 }),
      job({ pctBilled: 80, forecastRevenue: 300_000 }),
    ])
    expect(s.avgPctBilled).toBe(65)
  })
})
