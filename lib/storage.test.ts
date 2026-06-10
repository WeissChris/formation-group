import { describe, it, expect, beforeEach } from 'vitest'
import { installBrowserEnv, resetBrowserEnv } from '../test/setup-browser-env'
installBrowserEnv()

// Import AFTER env install so storage.ts sees window/localStorage at module-eval time.
// (storage.ts guards on typeof window === 'undefined' but localStorage references are
// resolved at call time, so order isn't strictly required — but explicit is better.)
import {
  saveProject, loadProjects, deleteProject,
  saveEstimate, loadEstimates,
  saveProposal, loadProposals,
  saveWeeklyRevenue, loadWeeklyRevenue,
  deleteGanttGeneratedRevenueByProject,
  deleteWeeklyRevenueByProject,
  generateInvoiceStages,
} from './storage'
import type { Project, Estimate, DesignProposal, WeeklyRevenue } from '@/types'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    entity: 'formation',
    name: 'Test Project',
    address: '',
    clientName: '',
    status: 'active',
    contractValue: 100000,
    startDate: '2026-01-01',
    plannedCompletion: '2026-06-30',
    foreman: 'CAM',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function estimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: 'e1',
    projectId: 'p1',
    projectName: 'Test',
    version: 1,
    status: 'draft',
    defaultMarkupFormation: 40,
    defaultMarkupSubcontractor: 35,
    lineItems: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function proposal(overrides: Partial<DesignProposal> = {}): DesignProposal {
  return {
    id: 'prop1',
    clientName: 'Client',
    projectAddress: '',
    status: 'draft',
    phase1Fee: 1000,
    phase1Scope: '',
    phase2Fee: 2000,
    phase2Scope: '',
    validUntil: '2026-12-31',
    acceptanceToken: 'tok1',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function revenue(overrides: Partial<WeeklyRevenue> = {}): WeeklyRevenue {
  return {
    id: 'r1',
    projectId: 'p1',
    projectName: 'Test',
    entity: 'formation',
    weekEnding: '2026-02-06',
    weekNumber: 5,
    plannedRevenue: 10000,
    actualInvoiced: 0,
    isDeposit: false,
    notes: '',
    ...overrides,
  }
}

beforeEach(() => {
  resetBrowserEnv()
})

describe('saveProject auto-stamps updatedAt', () => {
  it('stamps updatedAt on first save', () => {
    const before = Date.now()
    saveProject(project({ id: 'p1' }))
    const after = Date.now()

    const saved = loadProjects()[0]
    expect(saved.updatedAt).toBeDefined()
    const ms = Date.parse(saved.updatedAt!)
    expect(ms).toBeGreaterThanOrEqual(before)
    expect(ms).toBeLessThanOrEqual(after)
  })

  it('updates updatedAt on every re-save', async () => {
    saveProject(project({ id: 'p1' }))
    const first = loadProjects()[0].updatedAt!
    // Tick at least 1ms so the stamps differ
    await new Promise(r => setTimeout(r, 2))
    saveProject(project({ id: 'p1', name: 'Renamed' }))
    const second = loadProjects()[0].updatedAt!
    expect(second > first).toBe(true)
  })

  it('overwrites caller-supplied stale updatedAt', () => {
    // Caller passes a stale stamp from a week ago. saveProject must replace it with `now`
    // so the Supabase safeUpsert can never be tricked into thinking a local edit is older
    // than it really is.
    const stale = '2026-01-01T00:00:00Z'
    saveProject({ ...project({ id: 'p1' }), updatedAt: stale })
    const saved = loadProjects()[0]
    expect(saved.updatedAt).not.toBe(stale)
  })
})

describe('save/load round-trip', () => {
  it('persists project across load calls', () => {
    saveProject(project({ id: 'p1', name: 'Alpha' }))
    saveProject(project({ id: 'p2', name: 'Beta' }))
    const loaded = loadProjects()
    expect(loaded).toHaveLength(2)
    expect(loaded.find(p => p.id === 'p1')?.name).toBe('Alpha')
    expect(loaded.find(p => p.id === 'p2')?.name).toBe('Beta')
  })

  it('replaces by id rather than duplicating', () => {
    saveProject(project({ id: 'p1', name: 'Original' }))
    saveProject(project({ id: 'p1', name: 'Updated' }))
    const loaded = loadProjects()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Updated')
  })

  it('saveEstimate round-trips and stamps updatedAt', async () => {
    saveEstimate(estimate({ id: 'e1', notes: 'first' }))
    const first = loadEstimates()[0].updatedAt
    await new Promise(r => setTimeout(r, 2))
    saveEstimate(estimate({ id: 'e1', notes: 'second' }))
    const second = loadEstimates()[0].updatedAt
    expect(second > first).toBe(true)
    expect(loadEstimates()[0].notes).toBe('second')
  })

  it('saveProposal round-trips and stamps updatedAt', () => {
    saveProposal(proposal({ id: 'prop1' }))
    const loaded = loadProposals()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].updatedAt).toBeDefined()
  })

  it('saveWeeklyRevenue round-trips and stamps updatedAt', () => {
    saveWeeklyRevenue(revenue({ id: 'r1' }))
    const loaded = loadWeeklyRevenue()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].updatedAt).toBeDefined()
  })
})

describe('delete helpers', () => {
  it('deleteProject removes the matching row only', () => {
    saveProject(project({ id: 'p1' }))
    saveProject(project({ id: 'p2' }))
    deleteProject('p1')
    const remaining = loadProjects()
    expect(remaining.map(p => p.id)).toEqual(['p2'])
  })
})

describe('deleteGanttGeneratedRevenueByProject', () => {
  it('keeps hand-entered rows (notes do not end with "(Gantt)")', () => {
    saveWeeklyRevenue(revenue({ id: 'r1', projectId: 'p1', notes: 'Deposit' }))
    saveWeeklyRevenue(revenue({ id: 'r2', projectId: 'p1', notes: 'Excavation (Gantt)' }))
    saveWeeklyRevenue(revenue({ id: 'r3', projectId: 'p1', notes: 'Tiling (Gantt)' }))
    saveWeeklyRevenue(revenue({ id: 'r4', projectId: 'p1', notes: '' })) // empty notes preserved (not gantt-tagged)

    deleteGanttGeneratedRevenueByProject('p1')
    const remaining = loadWeeklyRevenue()
    const ids = remaining.map(r => r.id).sort()
    expect(ids).toEqual(['r1', 'r4'])
  })

  it('does not touch other projects', () => {
    saveWeeklyRevenue(revenue({ id: 'r1', projectId: 'p1', notes: 'X (Gantt)' }))
    saveWeeklyRevenue(revenue({ id: 'r2', projectId: 'p2', notes: 'Y (Gantt)' }))
    deleteGanttGeneratedRevenueByProject('p1')
    const remaining = loadWeeklyRevenue()
    expect(remaining.map(r => r.id)).toEqual(['r2'])
  })

  it('handles missing notes safely', () => {
    saveWeeklyRevenue(revenue({ id: 'r1', projectId: 'p1', notes: undefined }))
    expect(() => deleteGanttGeneratedRevenueByProject('p1')).not.toThrow()
    expect(loadWeeklyRevenue()).toHaveLength(1) // undefined-notes row preserved (not gantt-tagged)
  })
})

describe('deleteWeeklyRevenueByProject (destructive)', () => {
  it('wipes EVERY revenue row for the project, including hand-entered', () => {
    saveWeeklyRevenue(revenue({ id: 'r1', projectId: 'p1', notes: 'Deposit' }))
    saveWeeklyRevenue(revenue({ id: 'r2', projectId: 'p1', notes: 'Excavation (Gantt)' }))
    saveWeeklyRevenue(revenue({ id: 'r3', projectId: 'p2', notes: 'Other' }))
    deleteWeeklyRevenueByProject('p1')
    const remaining = loadWeeklyRevenue()
    expect(remaining.map(r => r.id)).toEqual(['r3'])
  })
})

describe('generateInvoiceStages — derives from the variable phase list', () => {
  it('legacy 2-phase proposal → phase-1 50/50 deposit+balance, phase-2 100%', () => {
    const stages = generateInvoiceStages(proposal({ id: 'prop1', phase1Fee: 1000, phase2Fee: 2000 }))
    expect(stages).toHaveLength(3)
    expect(stages[0].amount).toBe(500)
    expect(stages[0].percentage).toBe(50)
    expect(stages[0].phase).toBe(1)
    expect(stages[1].amount).toBe(500)
    expect(stages[1].phase).toBe(1)
    expect(stages[2].amount).toBe(2000)
    expect(stages[2].percentage).toBe(100)
    expect(stages[2].phase).toBe(2)
  })

  it('odd phase-1 fee splits to the cent without losing a dollar', () => {
    const stages = generateInvoiceStages(proposal({ id: 'prop1', phase1Fee: 1001, phase2Fee: 0 }))
    const p1 = stages.filter(s => s.phase === 1)
    expect(p1).toHaveLength(2)
    expect(p1[0].amount + p1[1].amount).toBe(1001)
  })

  it('explicit 4-phase proposal: per-phase split, zero-fee phase skipped, title in the name', () => {
    const stages = generateInvoiceStages(proposal({
      id: 'prop1',
      phases: [
        { id: 'a', title: 'Discovery', fee: 1000, scope: '', depositSplit: true },
        { id: 'b', title: 'Concept', fee: 2000, scope: '' },
        { id: 'c', title: 'Detail', fee: 3000, scope: '' },
        { id: 'd', title: 'Handover', fee: 0, scope: '' },
      ],
    }))
    // Discovery → 2 stages (deposit/balance), Concept → 1, Detail → 1, Handover (0 fee) → 0
    expect(stages).toHaveLength(4)
    expect(stages.filter(s => s.phase === 1)).toHaveLength(2)
    expect(stages.find(s => s.phase === 2)?.amount).toBe(2000)
    expect(stages.find(s => s.phase === 3)?.amount).toBe(3000)
    expect(stages.find(s => s.phase === 4)).toBeUndefined()
    expect(stages[0].name).toContain('Discovery')
  })
})
