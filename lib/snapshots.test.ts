import { describe, it, expect } from 'vitest'
import { isEndOfMonthInAEST, melbourneISODate } from './snapshots'

// The end-of-month check is the gate for the auto-snapshot cron. If it fires on the wrong
// day, snapshots either skip a month or stamp the wrong date — both silent data-quality
// bugs. These tests pin the contract.

describe('isEndOfMonthInAEST', () => {
  it('returns true for 31 May (last day of May)', () => {
    // Build a Date that's clearly 31 May 2026 in Melbourne (use UTC 12:00 → ~22:00 Melb)
    const may31 = new Date(Date.UTC(2026, 4, 31, 12, 0, 0))
    expect(isEndOfMonthInAEST(may31)).toBe(true)
  })

  it('returns false for 30 May (not last day)', () => {
    const may30 = new Date(Date.UTC(2026, 4, 30, 12, 0, 0))
    expect(isEndOfMonthInAEST(may30)).toBe(false)
  })

  it('returns true for 30 June (last day of June — 30 days)', () => {
    const jun30 = new Date(Date.UTC(2026, 5, 30, 12, 0, 0))
    expect(isEndOfMonthInAEST(jun30)).toBe(true)
  })

  it('returns true for 28 February in a non-leap year', () => {
    // 2026 is not a leap year (not divisible by 4)
    const feb28 = new Date(Date.UTC(2026, 1, 28, 12, 0, 0))
    expect(isEndOfMonthInAEST(feb28)).toBe(true)
  })

  it('returns false for 28 February in a leap year (29th is the last day)', () => {
    // 2024 is a leap year
    const feb28 = new Date(Date.UTC(2024, 1, 28, 12, 0, 0))
    expect(isEndOfMonthInAEST(feb28)).toBe(false)
  })

  it('returns true for 29 February in a leap year', () => {
    const feb29 = new Date(Date.UTC(2024, 1, 29, 12, 0, 0))
    expect(isEndOfMonthInAEST(feb29)).toBe(true)
  })

  it('handles cron-firing-near-midnight UTC correctly (Melbourne ahead by 10-11h)', () => {
    // GitHub Action fires at ~14:00 UTC on 31 May → 00:00 Melbourne on 1 June.
    // Melbourne local date is then JUNE 1 — NOT the last day of May.
    const cronTime = new Date(Date.UTC(2026, 4, 31, 14, 0, 0)) // 14:00 UTC 31 May
    expect(isEndOfMonthInAEST(cronTime)).toBe(false)

    // BUT a cron firing at 13:00 UTC on 31 May is still 23:00 Melb on 31 May — last day
    const earlierCron = new Date(Date.UTC(2026, 4, 31, 13, 0, 0))
    expect(isEndOfMonthInAEST(earlierCron)).toBe(true)
  })
})

describe('melbourneISODate', () => {
  it('returns YYYY-MM-DD in Melbourne local time', () => {
    // UTC 12:00 on 28 May 2026 → Melbourne 22:00 on 28 May → date string 2026-05-28
    const d = new Date(Date.UTC(2026, 4, 28, 12, 0, 0))
    expect(melbourneISODate(d)).toBe('2026-05-28')
  })

  it('rolls over to the next day when UTC is past Melbourne midnight', () => {
    // UTC 14:30 on 31 May 2026 → Melbourne 00:30 on 1 June
    const d = new Date(Date.UTC(2026, 4, 31, 14, 30, 0))
    expect(melbourneISODate(d)).toBe('2026-06-01')
  })

  it('pads single-digit months and days', () => {
    // 5 January 2026 in Melbourne
    const d = new Date(Date.UTC(2026, 0, 5, 0, 0, 0))
    expect(melbourneISODate(d)).toBe('2026-01-05')
  })
})
