// Locks the takeoff quota behaviour: the localStorage copy must never carry base64 plan images
// (a single plan is megabytes and the ~5MB quota is shared with every other store - a big
// takeoff starved fg_estimates into silent QuotaExceeded save failures), and the loader must
// graft images back from the full copy when the stripped one wins on freshness.

import { describe, it, expect, beforeEach } from 'vitest'
import { installBrowserEnv, resetBrowserEnv } from '../test/setup-browser-env'
installBrowserEnv()

import { saveTakeoff, loadTakeoffAsync } from './storage'
import type { TakeoffData } from '@/types'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'

function takeoff(overrides: Partial<TakeoffData> = {}): TakeoffData {
  return {
    estimateId: 'e1',
    plans: [{ id: 'plan1', name: 'Site plan', dataUrl: DATA_URL, scale: 1 } as TakeoffData['plans'][number]],
    groups: [{ id: 'g1', name: 'Group', items: [] } as unknown as TakeoffData['groups'][number]],
    activePlanId: 'plan1',
    ...overrides,
  }
}

beforeEach(() => resetBrowserEnv())

describe('saveTakeoff localStorage image strip', () => {
  it('writes the localStorage copy without base64 plan images', () => {
    saveTakeoff(takeoff())
    const stored = JSON.parse(globalThis.localStorage.getItem('fg_takeoffs')!) as TakeoffData[]
    expect(stored).toHaveLength(1)
    expect(stored[0].plans[0].dataUrl).toBe('')
    expect(stored[0].groups).toHaveLength(1)
  })

  it('keeps non-data URLs (already-synced remote images) in the localStorage copy', () => {
    saveTakeoff(takeoff({ plans: [{ id: 'plan1', name: 'Site plan', dataUrl: 'https://x/plan.png', scale: 1 } as TakeoffData['plans'][number]] }))
    const stored = JSON.parse(globalThis.localStorage.getItem('fg_takeoffs')!) as TakeoffData[]
    expect(stored[0].plans[0].dataUrl).toBe('https://x/plan.png')
  })

  it('returns the full (unstripped) stamped copy to the caller', () => {
    const saved = saveTakeoff(takeoff())
    expect(saved.plans[0].dataUrl).toBe(DATA_URL)
    expect(saved.updatedAt).toBeTruthy()
  })
})

describe('loadTakeoffAsync', () => {
  it('loads the stripped localStorage copy when IndexedDB is unavailable (measurements intact)', async () => {
    saveTakeoff(takeoff())
    // The test env's IndexedDB stub never completes, so only localStorage answers.
    const loaded = await loadTakeoffAsync('e1')
    expect(loaded).toBeTruthy()
    expect(loaded!.groups).toHaveLength(1)
    expect(loaded!.plans[0].dataUrl).toBe('')  // image lives in IDB/Supabase; grafted when available
  })
})
