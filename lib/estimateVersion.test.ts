import { describe, it, expect } from 'vitest'
import { versionFamily, versionGroupIdOf, buildNextVersion, copyLineItemsInto, lineExistsIn } from './estimateVersion'
import type { Estimate } from '@/types'

let n = 0
const gid = () => `gen-${++n}`

const base = (over: Partial<Estimate> = {}): Estimate => ({
  id: 'e1', projectId: '', projectName: 'Jiang residence', name: '', version: 1, status: 'sent',
  defaultMarkupFormation: 30, defaultMarkupSubcontractor: 15,
  lineItems: [{ id: 'li1', estimateId: 'e1', category: 'Paving', description: 'Pave', type: 'Material',
    quantity: 1, unitCost: 100, total: 100, included: true,
    labourBreakdown: [{ id: 'b1', label: 'lay', hours: 4 }] } as unknown as Estimate['lineItems'][0]],
  createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
  ...over,
})

describe('versionGroupIdOf', () => {
  it('uses the set group id, else the estimate id', () => {
    expect(versionGroupIdOf(base())).toBe('e1')
    expect(versionGroupIdOf(base({ versionGroupId: 'grp' }))).toBe('grp')
  })
})

describe('versionFamily', () => {
  it('groups by versionGroupId', () => {
    const a = base({ id: 'a', versionGroupId: 'g' })
    const b = base({ id: 'b', versionGroupId: 'g', version: 2 })
    const c = base({ id: 'c', versionGroupId: 'other' })
    expect(versionFamily([a, b, c], a).map(e => e.id).sort()).toEqual(['a', 'b'])
  })
  it('falls back to a shared projectId for older quotes', () => {
    const a = base({ id: 'a', projectId: 'p1' })
    const b = base({ id: 'b', projectId: 'p1', version: 2 })
    const c = base({ id: 'c', projectId: 'p2' })
    expect(versionFamily([a, b, c], a).map(e => e.id).sort()).toEqual(['a', 'b'])
  })
  it('excludes variations (they have a parent)', () => {
    const a = base({ id: 'a', versionGroupId: 'g' })
    const v = base({ id: 'v', versionGroupId: 'g', parentEstimateId: 'a', status: 'variation' })
    expect(versionFamily([a, v], a).map(e => e.id)).toEqual(['a'])
  })
  it('finds the anchor row even when its own copy lacks versionGroupId', () => {
    // v1 is the anchor: v2/v3 carry versionGroupId = v1.id, but v1's own copy predates the
    // persisted link (pre-migration-42 localStorage). Its id IS the group id - it must be family.
    const v1 = base({ id: 'v1' })
    const v2 = base({ id: 'v2', versionGroupId: 'v1', version: 2 })
    const v3 = base({ id: 'v3', versionGroupId: 'v1', version: 3 })
    expect(versionFamily([v1, v2, v3], v3).map(e => e.id).sort()).toEqual(['v1', 'v2', 'v3'])
    // And browsing FROM the unlinked anchor finds its children too.
    expect(versionFamily([v1, v2, v3], v1).map(e => e.id).sort()).toEqual(['v1', 'v2', 'v3'])
  })
})

describe('buildNextVersion', () => {
  it('bumps to max+1, resets to a fresh draft, and re-mints ids', () => {
    n = 0
    const v1 = base()
    const v2 = buildNextVersion(v1, [v1], 'e2', gid, '2026-07-09T00:00:00Z')
    expect(v2.id).toBe('e2')
    expect(v2.version).toBe(2)
    expect(v2.status).toBe('draft')
    expect(v2.versionGroupId).toBe('e1')             // group anchored on the source
    expect(v2.isBaseline).toBe(false)
    // line-item + labour-breakdown ids are fresh and re-pointed at the new estimate
    expect(v2.lineItems[0].id).not.toBe('li1')
    expect(v2.lineItems[0].estimateId).toBe('e2')
    expect(v2.lineItems[0].labourBreakdown![0].id).not.toBe('b1')
    // scope preserved
    expect(v2.lineItems[0].total).toBe(100)
  })

  it('clears acceptance + variation identity from the source', () => {
    const v1 = base({ status: 'accepted', acceptedAt: 'x', acceptedByName: 'Kevin', sentAt: 'y', isBaseline: true })
    const v2 = buildNextVersion(v1, [v1], 'e2', gid, '2026-07-09T00:00:00Z')
    expect(v2.acceptedAt).toBeUndefined()
    expect(v2.acceptedByName).toBeUndefined()
    expect(v2.sentAt).toBeUndefined()
    expect(v2.isBaseline).toBe(false)
  })

  it('counts the whole family when numbering (v3 after v1+v2)', () => {
    const v1 = base({ id: 'a', versionGroupId: 'g', version: 1 })
    const v2 = base({ id: 'b', versionGroupId: 'g', version: 2 })
    const v3 = buildNextVersion(v2, [v1, v2], 'c', gid, '2026-07-09T00:00:00Z')
    expect(v3.version).toBe(3)
  })
})

describe('copyLineItemsInto', () => {
  let seq = 0
  const gid = () => `n${++seq}`
  const li = (over: Record<string, unknown> = {}) => ({
    id: 'old', estimateId: 'v1', displayOrder: '1', category: 'Paving', description: 'Bluestone',
    type: 'Material' as const, units: 10, uom: 'm2', unitCost: 50, total: 500, markupPercent: 45,
    revenue: 725, crewType: 'Formation' as const, ...over,
  })

  it('re-mints ids, retargets the estimate and re-enables', () => {
    seq = 0
    const out = copyLineItemsInto([li({ enabled: false, labourBreakdown: [{ id: 'lb1', label: 'x', hours: 4 }] })], 'v3', gid)
    expect(out[0].id).toBe('n1')
    expect(out[0].estimateId).toBe('v3')
    expect(out[0].enabled).toBe(true)
    expect(out[0].labourBreakdown![0].id).toBe('n2')
    expect(out[0].labourBreakdown![0].hours).toBe(4)
    expect(out[0].total).toBe(500)
    expect(out[0].quoteFilePath).toBeUndefined()
  })

  it('carries quote file references across untouched', () => {
    const out = copyLineItemsInto([li({ quoteFileName: 'q.pdf', quoteFilePath: 'estimates/v1/old/q.pdf' })], 'v3', gid)
    expect(out[0].quoteFilePath).toBe('estimates/v1/old/q.pdf')
  })
})

describe('lineExistsIn', () => {
  const li = (category: string, description: string, enabled = true) => ({
    id: 'x', estimateId: 'e', displayOrder: '1', category, description,
    type: 'Material' as const, units: 1, uom: 'EA', unitCost: 1, total: 1, markupPercent: 0,
    revenue: 1, crewType: 'Formation' as const, enabled,
  })

  it('matches on category + description, case and whitespace insensitive', () => {
    expect(lineExistsIn([li('Paving', 'Bluestone 400x400')], li('paving', ' bluestone 400x400 '))).toBe(true)
  })
  it('does not match across categories or different descriptions', () => {
    expect(lineExistsIn([li('Decking', 'Bluestone 400x400')], li('Paving', 'Bluestone 400x400'))).toBe(false)
    expect(lineExistsIn([li('Paving', 'Bluestone 300x300')], li('Paving', 'Bluestone 400x400'))).toBe(false)
  })
  it('ignores disabled lines - re-adding something turned off counts as missing', () => {
    expect(lineExistsIn([li('Paving', 'Bluestone', false)], li('Paving', 'Bluestone'))).toBe(false)
  })
})
