import { describe, it, expect } from 'vitest'
import {
  getFinancialYear,
  getFridaysInMonth,
  snapToFriday,
  generateForemanPin,
  isLegacyForemanPin,
  toISODate,
  clientDisplayName,
} from './utils'

describe('getFinancialYear (AU Jul-Jun)', () => {
  it('treats July as the first month of the new FY', () => {
    expect(getFinancialYear(new Date(2025, 6, 1))).toBe('FY 2025-26') // 1 Jul 2025
  })

  it('treats June as the last month of the old FY', () => {
    expect(getFinancialYear(new Date(2025, 5, 30))).toBe('FY 2024-25') // 30 Jun 2025
  })

  it('handles a December date (mid-FY)', () => {
    expect(getFinancialYear(new Date(2025, 11, 15))).toBe('FY 2025-26')
  })

  it('handles a January date (still same FY)', () => {
    expect(getFinancialYear(new Date(2026, 0, 15))).toBe('FY 2025-26')
  })
})

describe('getFridaysInMonth', () => {
  it('returns all Fridays in a month', () => {
    // June 2026: Fri 5, 12, 19, 26
    const fridays = getFridaysInMonth(2026, 5)
    expect(fridays).toHaveLength(4)
    expect(fridays.map(toISODate)).toEqual([
      '2026-06-05',
      '2026-06-12',
      '2026-06-19',
      '2026-06-26',
    ])
  })

  it('handles a 5-Friday month', () => {
    // July 2026: Fri 3, 10, 17, 24, 31
    const fridays = getFridaysInMonth(2026, 6)
    expect(fridays).toHaveLength(5)
  })

  it('handles a month starting on Friday', () => {
    // May 2026 starts on Fri 1
    const fridays = getFridaysInMonth(2026, 4)
    expect(fridays[0].getDate()).toBe(1)
  })
})

describe('snapToFriday', () => {
  // Day numbering: Sun=0, Mon=1, ... Fri=5, Sat=6

  it('returns the same date when already a Friday', () => {
    const fri = new Date(2026, 5, 5) // Fri 5 Jun 2026
    const snapped = snapToFriday(fri)
    expect(snapped.getDate()).toBe(5)
  })

  it('forwards Sun-Thu to upcoming Friday', () => {
    // Mon 1 Jun 2026 → Fri 5 Jun
    expect(snapToFriday(new Date(2026, 5, 1)).getDate()).toBe(5)
    // Thu 4 Jun 2026 → Fri 5 Jun
    expect(snapToFriday(new Date(2026, 5, 4)).getDate()).toBe(5)
    // Sun 31 May 2026 → Fri 5 Jun
    expect(snapToFriday(new Date(2026, 4, 31)).getDate()).toBe(5)
  })

  it('snaps Saturday BACK to yesterday (not forward to next Friday)', () => {
    // This is the bug fix from the CTO audit — Sat used to jump 6 days forward.
    // Sat 6 Jun 2026 → Fri 5 Jun, NOT Fri 12 Jun
    const sat = new Date(2026, 5, 6)
    const snapped = snapToFriday(sat)
    expect(snapped.getDate()).toBe(5)
    expect(snapped.getMonth()).toBe(5)
  })

  it('does not mutate the input date', () => {
    const input = new Date(2026, 5, 1) // Mon
    const before = input.getTime()
    snapToFriday(input)
    expect(input.getTime()).toBe(before)
  })
})

describe('isLegacyForemanPin', () => {
  it('matches SUBURB-FOREMAN-YEAR format', () => {
    expect(isLegacyForemanPin('BEACH-CAM-2026')).toBe(true)
    expect(isLegacyForemanPin('SERPELLS-CAM-2026')).toBe(true)
    expect(isLegacyForemanPin('CLIFTON-CAM-2026')).toBe(true)
  })

  it('does not match crypto-random UUIDs', () => {
    expect(isLegacyForemanPin('A1B2C3D4E5F6789012345678901234AB')).toBe(false)
  })

  it('handles undefined and empty', () => {
    expect(isLegacyForemanPin(undefined)).toBe(false)
    expect(isLegacyForemanPin('')).toBe(false)
  })

  it('rejects nearly-matching but invalid strings', () => {
    expect(isLegacyForemanPin('beach-cam-2026')).toBe(false) // lowercase
    expect(isLegacyForemanPin('BEACH-CAM')).toBe(false)      // no year
    expect(isLegacyForemanPin('BEACH-CAM-26')).toBe(false)   // 2-digit year
    expect(isLegacyForemanPin('BEACH-CAM-2026-EXTRA')).toBe(false)
  })
})

describe('generateForemanPin', () => {
  it('returns a high-entropy uppercase token (no dashes)', () => {
    const pin = generateForemanPin()
    expect(pin).toMatch(/^[A-Z0-9]{32}$/)
  })

  it('is not in the legacy format', () => {
    const pin = generateForemanPin()
    expect(isLegacyForemanPin(pin)).toBe(false)
  })

  it('produces a unique value each call', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add(generateForemanPin())
    expect(seen.size).toBe(50)
  })
})

describe('clientDisplayName', () => {
  it('collapses a shared surname', () => {
    expect(clientDisplayName('Paul Manohar', 'Jacqui Manohar')).toBe('Paul & Jacqui Manohar')
  })

  it('keeps both full names when the surnames differ', () => {
    expect(clientDisplayName('Paul Manohar', 'Jacqui Smith')).toBe('Paul Manohar & Jacqui Smith')
  })

  it('collapses multi-word surnames as a whole tail', () => {
    expect(clientDisplayName('Paul van der Berg', 'Jacqui van der Berg')).toBe('Paul & Jacqui van der Berg')
    // Different multi-word tails do not collapse.
    expect(clientDisplayName('Paul van der Berg', 'Jacqui der Berg')).toBe('Paul van der Berg & Jacqui der Berg')
  })

  it('compares surnames case-insensitively, keeping the first spelling', () => {
    expect(clientDisplayName('Paul MANOHAR', 'Jacqui Manohar')).toBe('Paul & Jacqui MANOHAR')
  })

  it('leaves first-name-only pairs alone', () => {
    expect(clientDisplayName('Paul', 'Jacqui')).toBe('Paul & Jacqui')
    expect(clientDisplayName('Paul', 'Jacqui Manohar')).toBe('Paul & Jacqui Manohar')
  })

  it('handles a single or missing name', () => {
    expect(clientDisplayName('Paul Manohar')).toBe('Paul Manohar')
    expect(clientDisplayName('', 'Jacqui Manohar')).toBe('Jacqui Manohar')
    expect(clientDisplayName('')).toBe('')
  })
})
