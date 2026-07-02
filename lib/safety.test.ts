import { describe, it, expect } from 'vitest'
import { normalisePhone, nextShortRef, boardToRow, mapSiteBoard, DEFAULT_BOARD_HAZARDS } from './safety'

describe('normalisePhone', () => {
  it('normalises AU formats to a stable digits key', () => {
    expect(normalisePhone('0412 345 678')).toBe('0412345678')
    expect(normalisePhone('+61 412 345 678')).toBe('0412345678')
    expect(normalisePhone('61412345678')).toBe('0412345678')
    expect(normalisePhone('(03) 9123 4567')).toBe('0391234567')
    expect(normalisePhone('')).toBe('')
  })
})

describe('nextShortRef', () => {
  it('builds entity-prefixed, zero-padded, per-year refs', () => {
    expect(nextShortRef('formation', 2026, 0)).toBe('FORM-2026-001')
    expect(nextShortRef('lume', 2026, 11)).toBe('LUME-2026-012')
  })
})

describe('boardToRow / mapSiteBoard', () => {
  it('round-trips board fields through the snake_case row shape', () => {
    const row = boardToRow({
      principalContractor: 'Formation Landscapes Pty Ltd',
      supervisorNameNumber: 'Andrew - 0400 000 000',
      hazards: DEFAULT_BOARD_HAZARDS,
      hazardsReviewedOn: '2026-07-02',
    })
    expect(row.principal_contractor).toBe('Formation Landscapes Pty Ltd')
    expect(row.supervisor_name_number).toBe('Andrew - 0400 000 000')
    expect(row.hazards_reviewed_on).toBe('2026-07-02')
    const back = mapSiteBoard({ site_id: 's1', ...row })
    expect(back.principalContractor).toBe('Formation Landscapes Pty Ltd')
    expect(back.hazards).toHaveLength(DEFAULT_BOARD_HAZARDS.length)
  })
  it('omits undefined fields (partial PATCH) and nulls an empty review date', () => {
    const row = boardToRow({ firstAider: 'Sam' , hazardsReviewedOn: '' })
    expect(Object.keys(row).sort()).toEqual(['first_aider', 'hazards_reviewed_on'])
    expect(row.hazards_reviewed_on).toBeNull()
  })
})
