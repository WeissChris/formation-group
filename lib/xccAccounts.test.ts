import { describe, it, expect } from 'vitest'
import { isAllowedXccAccount, XCC_ALLOWED_ACCOUNTS } from './xccAccounts'

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
