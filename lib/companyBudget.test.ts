import { describe, it, expect } from 'vitest'
import { fyStartYearOf, fyLabelOf, fyRangeIso, fyElapsedPct, computeBudgetProgress } from './companyBudget'

describe('FY helpers (Australian July-June year)', () => {
  it('July onward belongs to the FY starting that year', () => {
    expect(fyStartYearOf(new Date('2026-07-01T00:00:00'))).toBe(2026)
    expect(fyStartYearOf(new Date('2026-12-15T00:00:00'))).toBe(2026)
  })

  it('January-June belongs to the FY started the previous year', () => {
    expect(fyStartYearOf(new Date('2026-06-30T00:00:00'))).toBe(2025)
    expect(fyStartYearOf(new Date('2027-02-01T00:00:00'))).toBe(2026)
  })

  it('label matches lib/utils.getFinancialYear format', () => {
    expect(fyLabelOf(2026)).toBe('FY 2026-27')
  })

  it('range spans 1 July to 30 June', () => {
    expect(fyRangeIso(2026)).toEqual({ fromIso: '2026-07-01', toIso: '2027-06-30' })
  })

  it('elapsed fraction clamps to the FY bounds', () => {
    expect(fyElapsedPct(2026, '2026-06-01')).toBe(0)     // before the FY
    expect(fyElapsedPct(2026, '2027-08-01')).toBe(1)     // after the FY
    const mid = fyElapsedPct(2026, '2026-12-30')          // ~halfway
    expect(mid).toBeGreaterThan(0.45)
    expect(mid).toBeLessThan(0.55)
  })
})

describe('computeBudgetProgress', () => {
  it('projection = invoiced to date + still scheduled', () => {
    const p = computeBudgetProgress(1_000_000, 400_000, 450_000)
    expect(p.projection).toBe(850_000)
    expect(p.variance).toBe(-150_000)
    expect(p.pctOfTarget).toBe(85)
  })

  it('over-target years read positive', () => {
    const p = computeBudgetProgress(1_000_000, 700_000, 400_000)
    expect(p.variance).toBe(100_000)
    expect(p.pctOfTarget).toBe(110)
  })

  it('no target -> pctOfTarget is null, never a divide-by-zero', () => {
    const p = computeBudgetProgress(0, 100_000, 50_000)
    expect(p.pctOfTarget).toBeNull()
    expect(p.projection).toBe(150_000)
  })
})
