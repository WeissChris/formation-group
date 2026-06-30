import { describe, it, expect } from 'vitest'
import { isNewer, mergeKeyed, type Keyed } from './mergeKeyed'

const row = (id: string, updatedAt?: string): Keyed => ({ id, updatedAt })
const ids = (rs: Keyed[]) => rs.map(r => r.id).sort()
const byId = (rs: Keyed[], id: string) => rs.find(r => r.id === id)

describe('isNewer', () => {
  it('a missing remote never wins; a missing local always loses', () => {
    expect(isNewer(undefined, '2026-06-01T00:00:00Z')).toBe(false)
    expect(isNewer('2026-06-01T00:00:00Z', undefined)).toBe(true)
  })
  it('compares by parsed time, not raw string (space-form vs ISO T-form)', () => {
    // Same instant, different serialisations: neither is strictly newer.
    expect(isNewer('2026-06-12 07:32:35+00', '2026-06-12T07:32:35Z')).toBe(false)
    // A genuinely newer space-form row must still beat an older ISO row.
    expect(isNewer('2026-06-12 09:00:00+00', '2026-06-12T07:32:35Z')).toBe(true)
  })
  it('strictly newer only — equal timestamps do not win', () => {
    expect(isNewer('2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z')).toBe(false)
  })
})

describe('mergeKeyed (newest-wins, preserve local-only)', () => {
  it('adopts a remote row missing locally', () => {
    const { merged, changed } = mergeKeyed([row('a', '2026-06-01T00:00:00Z')], [row('b', '2026-06-02T00:00:00Z')])
    expect(changed).toBe(true)
    expect(ids(merged)).toEqual(['a', 'b'])
  })

  it('replaces a local row when the remote copy is newer', () => {
    const { merged, changed } = mergeKeyed(
      [row('a', '2026-06-01T00:00:00Z')],
      [row('a', '2026-06-05T00:00:00Z')],
    )
    expect(changed).toBe(true)
    expect(byId(merged, 'a')?.updatedAt).toBe('2026-06-05T00:00:00Z')
  })

  it('keeps the local row when the remote copy is older — and reports no change', () => {
    const { merged, changed } = mergeKeyed(
      [row('a', '2026-06-10T00:00:00Z')],
      [row('a', '2026-06-01T00:00:00Z')],
    )
    expect(changed).toBe(false)
    expect(byId(merged, 'a')?.updatedAt).toBe('2026-06-10T00:00:00Z')
  })

  it('preserves a local-only row the remote set has not seen yet', () => {
    // The cross-device case: device B created 'local-only' but never pushed; a resync must not drop it.
    const { merged } = mergeKeyed(
      [row('local-only', '2026-06-09T00:00:00Z'), row('shared', '2026-06-01T00:00:00Z')],
      [row('shared', '2026-06-05T00:00:00Z')],
    )
    expect(ids(merged)).toEqual(['local-only', 'shared'])
    expect(byId(merged, 'shared')?.updatedAt).toBe('2026-06-05T00:00:00Z')
  })

  it('skips malformed remote rows (no id)', () => {
    const { merged, changed } = mergeKeyed([row('a', '2026-06-01T00:00:00Z')], [{ id: '', updatedAt: 'x' } as Keyed])
    expect(changed).toBe(false)
    expect(ids(merged)).toEqual(['a'])
  })

  it('keepLocalOnly prunes stale local-only rows the predicate rejects, keeps the rest', () => {
    // Models stale Gantt forecast rows: a local "(Gantt)" row absent from remote is pruned when the
    // remote still holds that project's forecast; manual rows and fresh-project gantt rows are kept.
    type Row = Keyed & { projectId: string; notes: string }
    const local: Row[] = [
      { id: 'stale', projectId: 'p1', notes: 'Decking (Gantt)' },     // stale: remote replaced p1's forecast
      { id: 'manual', projectId: 'p1', notes: 'Deposit' },            // manual: keep
      { id: 'fresh', projectId: 'p2', notes: 'Paving (Gantt)' },      // p2 has no remote forecast yet: keep
    ]
    const remote: Row[] = [{ id: 'new', projectId: 'p1', notes: 'Decking — Labour (Gantt)' }]
    const keep = (row: Row, rem: Row[]) => {
      if (!row.notes.trim().endsWith('(Gantt)')) return true
      return !rem.some(x => x.projectId === row.projectId && x.notes.trim().endsWith('(Gantt)'))
    }
    const { merged, changed } = mergeKeyed(local, remote, keep)
    expect(changed).toBe(true)
    expect(ids(merged)).toEqual(['fresh', 'manual', 'new'])   // 'stale' pruned
  })

  it('without keepLocalOnly, all local-only rows are preserved (default)', () => {
    const { merged } = mergeKeyed([row('a'), row('b')], [row('a')])
    expect(ids(merged)).toEqual(['a', 'b'])
  })

  it('models the incident: a remote entry edited on another device replaces the stale local copy', () => {
    // Colleague saved Outdoor kitchen with subtasks (newer); this device holds the stale subtask-less copy.
    type Entry = Keyed & { subtasks: string[] }
    const local: Entry[] = [{ id: 'ok', updatedAt: '2026-06-20T00:00:00Z', subtasks: [] }]
    const remote: Entry[] = [{ id: 'ok', updatedAt: '2026-06-29T00:00:00Z', subtasks: ['Cabinet measure', 'Cabinet install'] }]
    const { merged, changed } = mergeKeyed(local, remote)
    expect(changed).toBe(true)
    expect(byId(merged, 'ok') && (byId(merged, 'ok') as Entry).subtasks).toEqual(['Cabinet measure', 'Cabinet install'])
  })
})
