import { describe, it, expect } from 'vitest'
import { isAllowedXccAccount, missingAllowedAccounts, XCC_ALLOWED_ACCOUNTS } from './xccAccounts'

describe('isAllowedXccAccount', () => {
  it('matches every curated bucket exactly', () => {
    for (const name of XCC_ALLOWED_ACCOUNTS) expect(isAllowedXccAccount(name)).toBe(true)
  })

  it('ignores case and surrounding/among whitespace', () => {
    expect(isAllowedXccAccount('  concrete ')).toBe(true)
    expect(isAllowedXccAccount('MATERIALS & SUPPLIES')).toBe(true)
    expect(isAllowedXccAccount('Paving  -  Materials')).toBe(true)   // collapsed inner spaces
  })

  it('treats "&" and "and" as the same (Xero spelling vs the sheet)', () => {
    expect(isAllowedXccAccount('Wages and Salaries')).toBe(true)     // list has "Wages & Salaries"
    expect(isAllowedXccAccount('Materials and Supplies')).toBe(true)
    expect(isAllowedXccAccount('Fences & Gates')).toBe(true)         // list has "Fences and Gates"
  })

  it('rejects accounts not on the list', () => {
    expect(isAllowedXccAccount('Bank Fees')).toBe(false)
    expect(isAllowedXccAccount('Office Rent')).toBe(false)
    expect(isAllowedXccAccount('')).toBe(false)
  })
})

describe('missingAllowedAccounts', () => {
  it('returns the whole list when nothing is present', () => {
    expect(missingAllowedAccounts([]).length).toBe(XCC_ALLOWED_ACCOUNTS.length)
  })
  it('excludes present buckets, matching on &/and and case', () => {
    const missing = missingAllowedAccounts(['concrete', 'Wages and Salaries'])
    expect(missing).not.toContain('Concrete')
    expect(missing).not.toContain('Wages & Salaries')     // matched via "and" spelling
    expect(missing).toContain('Excavation')
  })
})
