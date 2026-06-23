import { describe, it, expect } from 'vitest'
import { workingDaysBetween, labourWorkingDays } from './ganttSchedule'

// Reference weekdays (verified against the app's Friday grid): 2026-06-19/26 and 2026-07-03 are Fridays;
// 2026-06-15 is a Monday, 2026-06-17 a Wednesday.

describe('workingDaysBetween', () => {
  it('counts Mon–Fri inclusive', () => {
    expect(workingDaysBetween('2026-06-15', '2026-06-19')).toBe(5)   // Mon–Fri
    expect(workingDaysBetween('2026-06-15', '2026-06-17')).toBe(3)   // Mon–Wed
    expect(workingDaysBetween('2026-06-19', '2026-06-19')).toBe(1)   // single Friday
    expect(workingDaysBetween('2026-06-19', '2026-06-26')).toBe(6)   // Fri→Fri (calendar count)
  })
  it('is 0 for empty dates', () => {
    expect(workingDaysBetween('', '2026-06-19')).toBe(0)
    expect(workingDaysBetween('2026-06-19', '')).toBe(0)
  })
})

describe('labourWorkingDays', () => {
  it('reads a weeks-view bar as 5 working days per week (the ~5x fix)', () => {
    expect(labourWorkingDays('2026-06-19', '2026-06-19')).toBe(5)    // 1-week bar → 5 (was 1)
    expect(labourWorkingDays('2026-06-19', '2026-06-26')).toBe(10)   // 2-week bar → 10 (was 6)
    expect(labourWorkingDays('2026-06-19', '2026-07-03')).toBe(15)   // 3-week bar → 15 (was 11)
  })
  it('uses the actual count for days-view / off-grid bars', () => {
    expect(labourWorkingDays('2026-06-15', '2026-06-17')).toBe(3)    // Mon–Wed
    expect(labourWorkingDays('2026-06-15', '2026-06-19')).toBe(5)    // Mon–Fri (start not Friday)
  })
  it("grain='days' counts a single day as 1 even on a Friday (Andrew's day-vs-week bug)", () => {
    expect(labourWorkingDays('2026-06-19', '2026-06-19', 'days')).toBe(1)  // 1-day bar on a Friday → 1 (was 5)
    expect(labourWorkingDays('2026-06-15', '2026-06-19', 'days')).toBe(5)  // Mon–Fri days bar → 5
    expect(labourWorkingDays('2026-06-19', '2026-06-19', 'weeks')).toBe(5) // explicit weeks 1-week bar → 5
  })
  it('is 0 for empty dates', () => {
    expect(labourWorkingDays('', '')).toBe(0)
  })
})
