import { describe, it, expect } from 'vitest'
import { companyCompliance, daysUntil, type PrequalDocument } from './safetyCompliance'

const TODAY = '2026-07-02'
const doc = (docType: string, expiresOn: string | null, uploadedAt = '2026-06-01T00:00:00Z'): PrequalDocument => ({
  id: `${docType}-${expiresOn}`, companyId: 'c1', docType, filename: 'f.pdf', storagePath: 'p',
  issuedOn: null, expiresOn, policyNumber: '', source: 'upload', uploadedAt,
})

describe('daysUntil', () => {
  it('counts calendar days (negative = past)', () => {
    expect(daysUntil('2026-07-09', TODAY)).toBe(7)
    expect(daysUntil('2026-07-02', TODAY)).toBe(0)
    expect(daysUntil('2026-06-30', TODAY)).toBe(-2)
  })
})

describe('companyCompliance', () => {
  it('is red when a REQUIRED doc is missing', () => {
    const c = companyCompliance([doc('public_liability', '2027-01-01')], TODAY)
    expect(c.status).toBe('missing_or_expired')            // workers_comp missing
    expect(c.needs).toContain('workers_comp')
  })

  it('is green when both required docs are current', () => {
    const c = companyCompliance([
      doc('public_liability', '2027-01-01'),
      doc('workers_comp', '2027-03-01'),
    ], TODAY)
    expect(c.status).toBe('ok')
    expect(c.needs).toHaveLength(0)
  })

  it('is amber when a doc expires within 14 days, red when expired', () => {
    const amber = companyCompliance([
      doc('public_liability', '2026-07-10'),               // 8 days out
      doc('workers_comp', '2027-03-01'),
    ], TODAY)
    expect(amber.status).toBe('expiring')
    expect(amber.needs).toContain('public_liability')

    const red = companyCompliance([
      doc('public_liability', '2026-06-20'),               // expired
      doc('workers_comp', '2027-03-01'),
    ], TODAY)
    expect(red.status).toBe('missing_or_expired')
  })

  it('the LATEST doc per type wins - a renewal clears an expired older one', () => {
    const c = companyCompliance([
      doc('public_liability', '2026-06-20', '2026-01-01T00:00:00Z'),   // old, expired
      doc('public_liability', '2027-06-20', '2026-07-01T00:00:00Z'),   // renewal
      doc('workers_comp', '2027-03-01'),
    ], TODAY)
    expect(c.status).toBe('ok')
  })

  it('an optional doc expiring makes it amber, not red', () => {
    const c = companyCompliance([
      doc('public_liability', '2027-01-01'),
      doc('workers_comp', '2027-03-01'),
      doc('white_card', '2026-07-05'),
    ], TODAY)
    expect(c.status).toBe('expiring')
  })
})
