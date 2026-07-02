import { describe, it, expect } from 'vitest'
import { aggregateTimesheetHours, parseXeroMsDate, weekEndingFriday, type XeroTimesheet } from './xeroHoursSync'

// 2026-06-22 = Mon, 2026-06-26 = Fri, 2026-07-03 = Fri.
const mapping = new Map([['track-a', 'proj-1'], ['track-b', 'proj-2']])
const msDate = (iso: string) => `/Date(${new Date(`${iso}T00:00:00Z`).getTime()}+0000)/`

describe('parseXeroMsDate / weekEndingFriday', () => {
  it('parses the /Date(ms)/ wire format', () => {
    expect(parseXeroMsDate(msDate('2026-06-22'))).toBe('2026-06-22')
    expect(parseXeroMsDate(undefined)).toBeNull()
  })
  it('snaps any day to its week-ending Friday', () => {
    expect(weekEndingFriday('2026-06-22')).toBe('2026-06-26')   // Mon -> Fri
    expect(weekEndingFriday('2026-06-26')).toBe('2026-06-26')   // Fri stays
    expect(weekEndingFriday('2026-06-27')).toBe('2026-06-26')   // Sat -> back to Fri
    expect(weekEndingFriday('2026-06-28')).toBe('2026-07-03')   // Sun -> forward
  })
})

describe('aggregateTimesheetHours', () => {
  it('buckets a daily-array line by each day\'s week - a fortnight splits across two Fridays', () => {
    const ts: XeroTimesheet[] = [{
      StartDate: msDate('2026-06-22'), EndDate: msDate('2026-07-05'),
      TimesheetLines: [{ TrackingItemID: 'track-a', NumberOfUnits: [8, 8, 8, 8, 6, 0, 0, 8, 8, 8, 8, 6, 0, 0] }],
    }]
    const { rows, linesMatched } = aggregateTimesheetHours(ts, mapping, '2026-01-01')
    expect(linesMatched).toBe(1)
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.week_ending === '2026-06-26')?.hours).toBe(38)
    expect(rows.find(r => r.week_ending === '2026-07-03')?.hours).toBe(38)
    expect(rows.every(r => r.project_id === 'proj-1')).toBe(true)
  })

  it('skips unmapped tracking + missing tracking, sums multiple lines/projects', () => {
    const ts: XeroTimesheet[] = [{
      StartDate: msDate('2026-06-22'), EndDate: msDate('2026-06-28'),
      TimesheetLines: [
        { TrackingItemID: 'track-a', NumberOfUnits: [8, 0, 0, 0, 0, 0, 0] },
        { TrackingItemID: 'track-b', NumberOfUnits: [0, 4, 0, 0, 0, 0, 0] },
        { TrackingItemID: 'track-unknown', NumberOfUnits: [8, 8, 8, 8, 8, 0, 0] },
        { NumberOfUnits: [8, 8, 8, 8, 8, 0, 0] },   // untagged - not attributable
      ],
    }]
    const { rows, linesMatched } = aggregateTimesheetHours(ts, mapping, '2026-01-01')
    expect(linesMatched).toBe(2)
    expect(rows.find(r => r.project_id === 'proj-1')?.hours).toBe(8)
    expect(rows.find(r => r.project_id === 'proj-2')?.hours).toBe(4)
  })

  it('a scalar NumberOfUnits lands on the END date\'s week; old weeks are dropped by since', () => {
    const ts: XeroTimesheet[] = [
      { StartDate: msDate('2026-06-22'), EndDate: msDate('2026-06-26'), TimesheetLines: [{ TrackingItemID: 'track-a', NumberOfUnits: 12 }] },
      { StartDate: msDate('2020-01-06'), EndDate: msDate('2020-01-10'), TimesheetLines: [{ TrackingItemID: 'track-a', NumberOfUnits: [8, 8, 8, 8, 8] }] },
    ]
    const { rows } = aggregateTimesheetHours(ts, mapping, '2026-01-01')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ project_id: 'proj-1', week_ending: '2026-06-26', hours: 12 })
  })
})
