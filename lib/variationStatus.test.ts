import { describe, it, expect } from 'vitest'
import { variationStage, isAwaitingOffice, isForemanEditable, daysSince } from './variationStatus'

describe('variationStage', () => {
  it('a foreman draft not yet submitted is Draft', () => {
    const s = variationStage({ status: 'draft', raisedBy: 'Cameron' })
    expect(s.key).toBe('drafting')
    expect(s.level).toBe('muted')
  })

  it('a submitted draft is with the office', () => {
    const s = variationStage({ status: 'draft', raisedBy: 'Cameron', submittedAt: '2026-07-20T01:00:00Z' })
    expect(s.key).toBe('with_office')
    expect(s.label).toBe('With office')
  })

  it('an office rejection beats the submission and reads as Changes needed', () => {
    const s = variationStage({
      status: 'draft', raisedBy: 'Cameron',
      submittedAt: '2026-07-20T01:00:00Z',
      officeRejectedAt: '2026-07-20T02:00:00Z', officeRejectReason: 'Price the excavator too',
    })
    expect(s.key).toBe('changes')
    expect(s.level).toBe('red')
  })

  it('resubmitting after a rejection goes back to the office', () => {
    // The route clears officeRejectedAt on resubmit, so the stage falls through to with_office.
    const s = variationStage({ status: 'draft', raisedBy: 'Cameron', submittedAt: '2026-07-20T03:00:00Z' })
    expect(s.key).toBe('with_office')
  })

  it('office-approved and emailed is Sent to client', () => {
    const s = variationStage({
      status: 'sent', raisedBy: 'Cameron',
      submittedAt: '2026-07-20T01:00:00Z', officeApprovedAt: '2026-07-20T04:00:00Z',
    })
    expect(s.key).toBe('sent')
  })

  it('a client opening the link flips it to Read', () => {
    const s = variationStage({ status: 'sent', officeApprovedAt: 'x', firstViewedAt: '2026-07-20T05:00:00Z' })
    expect(s.key).toBe('read')
    expect(s.label).toBe('Read by client')
  })

  it('client approval wins over everything', () => {
    const s = variationStage({ status: 'accepted', firstViewedAt: 'x', acceptedByName: 'J Smith' })
    expect(s.key).toBe('approved')
    expect(s.level).toBe('green')
  })

  it('client decline wins over everything', () => {
    const s = variationStage({ status: 'declined', firstViewedAt: 'x', declinedAt: 'y' })
    expect(s.key).toBe('declined')
  })

  it('an office-created variation with no foreman markers is Not sent', () => {
    expect(variationStage({ status: 'variation' }).key).toBe('office')
    expect(variationStage({ status: 'draft' }).key).toBe('office')
  })
})

describe('isAwaitingOffice', () => {
  it('is true only for a submitted, un-actioned draft', () => {
    expect(isAwaitingOffice({ status: 'draft', raisedBy: 'C', submittedAt: 'x' })).toBe(true)
    expect(isAwaitingOffice({ status: 'draft', raisedBy: 'C' })).toBe(false)
    expect(isAwaitingOffice({ status: 'draft', raisedBy: 'C', submittedAt: 'x', officeRejectedAt: 'y' })).toBe(false)
    expect(isAwaitingOffice({ status: 'sent', officeApprovedAt: 'y' })).toBe(false)
  })
})

describe('isForemanEditable', () => {
  it('allows editing before the office approves', () => {
    expect(isForemanEditable({ status: 'draft', raisedBy: 'C' })).toBe(true)
    expect(isForemanEditable({ status: 'draft', raisedBy: 'C', submittedAt: 'x' })).toBe(true)
    expect(isForemanEditable({ status: 'draft', raisedBy: 'C', submittedAt: 'x', officeRejectedAt: 'y' })).toBe(true)
  })
  it('locks it once the client has it, or could have it', () => {
    expect(isForemanEditable({ status: 'sent', officeApprovedAt: 'y' })).toBe(false)
    expect(isForemanEditable({ status: 'accepted' })).toBe(false)
    expect(isForemanEditable({ status: 'declined' })).toBe(false)
    // Belt and braces: approved but somehow still at draft status stays locked.
    expect(isForemanEditable({ status: 'draft', raisedBy: 'C', submittedAt: 'x', officeApprovedAt: 'z' })).toBe(false)
  })
})

describe('daysSince', () => {
  const now = new Date('2026-07-20T00:00:00Z')
  it('counts whole days', () => {
    expect(daysSince('2026-07-15T00:00:00Z', now)).toBe(5)
    expect(daysSince('2026-07-20T00:00:00Z', now)).toBe(0)
  })
  it('returns null for missing or unparseable input', () => {
    expect(daysSince(undefined, now)).toBeNull()
    expect(daysSince('not a date', now)).toBeNull()
  })
})
