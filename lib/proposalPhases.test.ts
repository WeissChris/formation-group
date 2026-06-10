import { describe, it, expect } from 'vitest'
import { getProposalPhases, syncLegacyPhaseFields, phasesTotal } from './proposalPhases'
import type { DesignProposal, ProposalPhase } from '@/types'

function legacyProposal(o: Partial<DesignProposal> = {}): DesignProposal {
  return {
    id: 'p', clientName: 'C', projectAddress: '', status: 'draft',
    phase1Fee: 1000, phase1Scope: 'Concept scope',
    phase2Fee: 2000, phase2Scope: 'DD scope',
    validUntil: '2026-12-31', acceptanceToken: 't', createdAt: '2026-01-01T00:00:00Z',
    ...o,
  }
}

describe('getProposalPhases — derivation parity with the old fixed phases', () => {
  it('derives 2 phases from legacy fields with the historic titles + deposit split on phase 1', () => {
    const phases = getProposalPhases(legacyProposal())
    expect(phases).toHaveLength(2)
    expect(phases[0].title).toBe('Concept / Schematic Design')
    expect(phases[0].fee).toBe(1000)
    expect(phases[0].scope).toBe('Concept scope')
    expect(phases[0].depositSplit).toBe(true)
    expect(phases[0].description).toContain('overall vision')   // historic default copy
    expect(phases[1].title).toBe('Design Development')
    expect(phases[1].fee).toBe(2000)
    expect(phases[1].depositSplit).toBeFalsy()
  })

  it('derives a 3rd phase only when phase3Fee > 0', () => {
    expect(getProposalPhases(legacyProposal({ phase3Fee: 500, phase3Scope: 'Admin' }))).toHaveLength(3)
    expect(getProposalPhases(legacyProposal({ phase3Fee: 0 }))).toHaveLength(2)
    expect(getProposalPhases(legacyProposal())).toHaveLength(2)
    const three = getProposalPhases(legacyProposal({ phase3Fee: 500, phase3Scope: 'Admin' }))
    expect(three[2].title).toBe('Administration')
    expect(three[2].fee).toBe(500)
  })

  it('returns the explicit phases array verbatim when present (any length)', () => {
    const explicit: ProposalPhase[] = [
      { id: 'a', title: 'Discovery', fee: 100, scope: 's1' },
      { id: 'b', title: 'Concept', fee: 200, scope: 's2' },
      { id: 'c', title: 'Detail', fee: 300, scope: 's3' },
      { id: 'd', title: 'Handover', fee: 400, scope: 's4' },
    ]
    const phases = getProposalPhases(legacyProposal({ phases: explicit }))
    expect(phases).toHaveLength(4)
    expect(phases.map(p => p.title)).toEqual(['Discovery', 'Concept', 'Detail', 'Handover'])
  })

  it('treats an empty phases array (Supabase default []) as "derive from legacy"', () => {
    const phases = getProposalPhases(legacyProposal({ phases: [] }))
    expect(phases).toHaveLength(2)
    expect(phases[0].title).toBe('Concept / Schematic Design')
  })
})

describe('syncLegacyPhaseFields — keeps legacy columns + array consistent', () => {
  it('writes the first three phases into the legacy fields and stores the full array', () => {
    const phases: ProposalPhase[] = [
      { id: 'a', title: 'One', fee: 11, scope: 's1' },
      { id: 'b', title: 'Two', fee: 22, scope: 's2' },
      { id: 'c', title: 'Three', fee: 33, scope: 's3' },
      { id: 'd', title: 'Four', fee: 44, scope: 's4' },
    ]
    const out = syncLegacyPhaseFields(legacyProposal(), phases)
    expect(out.phase1Fee).toBe(11); expect(out.phase1Scope).toBe('s1')
    expect(out.phase2Fee).toBe(22); expect(out.phase2Scope).toBe('s2')
    expect(out.phase3Fee).toBe(33); expect(out.phase3Scope).toBe('s3')
    expect(out.phases).toHaveLength(4)   // the 4th survives only in the array
  })

  it('clears the phase3 legacy fields when only two phases remain', () => {
    const out = syncLegacyPhaseFields(
      legacyProposal({ phase3Fee: 99, phase3Scope: 'old' }),
      [{ id: 'a', title: 'One', fee: 11, scope: 's1' }, { id: 'b', title: 'Two', fee: 22, scope: 's2' }],
    )
    expect(out.phase3Fee).toBeUndefined()
    expect(out.phase3Scope).toBeUndefined()
  })
})

describe('phasesTotal', () => {
  it('sums phase fees', () => {
    expect(phasesTotal([
      { id: 'a', title: '', fee: 100, scope: '' },
      { id: 'b', title: '', fee: 250, scope: '' },
    ])).toBe(350)
    expect(phasesTotal([])).toBe(0)
  })
})
