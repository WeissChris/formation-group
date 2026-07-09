import { describe, it, expect } from 'vitest'
import { versionFamily, versionGroupIdOf, buildNextVersion } from './estimateVersion'
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
