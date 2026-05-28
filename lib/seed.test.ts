// Tests for the seed-time migrations. These run on every login (LoginGate calls them)
// so they MUST be idempotent and MUST NOT clobber data they didn't create.

import { describe, it, expect, beforeEach } from 'vitest'
import { installBrowserEnv, resetBrowserEnv } from '../test/setup-browser-env'
installBrowserEnv()

import { migrateForemanPins } from './seed'
import { saveProject, loadProjects } from './storage'
import { isLegacyForemanPin } from './utils'
import type { Project } from '@/types'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    entity: 'formation',
    name: 'Test',
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

beforeEach(() => {
  resetBrowserEnv()
})

describe('migrateForemanPins', () => {
  it('rotates legacy SUBURB-FOREMAN-YEAR PINs to crypto-random tokens', () => {
    saveProject(project({ id: 'p1', foremanPin: 'BEACH-CAM-2026' }))
    saveProject(project({ id: 'p2', foremanPin: 'SERPELLS-CAM-2026' }))

    const result = migrateForemanPins()
    expect(result.changed).toBe(2)
    expect(result.rotated).toHaveLength(2)

    const after = loadProjects()
    for (const p of after) {
      expect(p.foremanPin).toBeDefined()
      expect(isLegacyForemanPin(p.foremanPin)).toBe(false)
    }
  })

  it('preserves already-rotated PINs untouched', () => {
    // Already crypto-random
    const modernPin = 'A1B2C3D4E5F6789012345678901234AB'
    saveProject(project({ id: 'p1', foremanPin: modernPin }))

    const result = migrateForemanPins()
    expect(result.changed).toBe(0)
    expect(loadProjects()[0].foremanPin).toBe(modernPin)
  })

  it('preserves projects with no foremanPin', () => {
    saveProject(project({ id: 'p1', foremanPin: undefined }))
    const result = migrateForemanPins()
    expect(result.changed).toBe(0)
    expect(loadProjects()[0].foremanPin).toBeUndefined()
  })

  it('is idempotent — running twice does not double-rotate', () => {
    saveProject(project({ id: 'p1', foremanPin: 'BEACH-CAM-2026' }))

    const firstResult = migrateForemanPins()
    expect(firstResult.changed).toBe(1)
    const pinAfterFirst = loadProjects()[0].foremanPin

    const secondResult = migrateForemanPins()
    expect(secondResult.changed).toBe(0)
    expect(loadProjects()[0].foremanPin).toBe(pinAfterFirst)
  })

  it('only touches the projects with legacy PINs (mixed batch)', () => {
    saveProject(project({ id: 'p1', foremanPin: 'BEACH-CAM-2026' }))         // legacy
    saveProject(project({ id: 'p2', foremanPin: undefined }))                  // no pin
    saveProject(project({ id: 'p3', foremanPin: 'A1B2C3D4E5F6789012345678901234AB' })) // modern

    const result = migrateForemanPins()
    expect(result.changed).toBe(1)
    expect(result.rotated[0].projectId).toBe('p1')
    expect(result.rotated[0].oldPin).toBe('BEACH-CAM-2026')

    const after = loadProjects()
    expect(after.find(p => p.id === 'p1')!.foremanPin).not.toBe('BEACH-CAM-2026')
    expect(after.find(p => p.id === 'p2')!.foremanPin).toBeUndefined()
    expect(after.find(p => p.id === 'p3')!.foremanPin).toBe('A1B2C3D4E5F6789012345678901234AB')
  })

  it('returns the old → new mapping so the caller can log it', () => {
    saveProject(project({ id: 'p1', foremanPin: 'BEACH-CAM-2026' }))
    const result = migrateForemanPins()
    expect(result.rotated[0]).toMatchObject({
      projectId: 'p1',
      oldPin: 'BEACH-CAM-2026',
    })
    expect(typeof result.rotated[0].newPin).toBe('string')
    expect(result.rotated[0].newPin.length).toBeGreaterThan(10)
  })
})
