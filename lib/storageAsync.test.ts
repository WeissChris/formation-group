// Tests for the conflict-aware Supabase sync layer in storageAsync.ts.
//
// `safeUpsert` is module-private, so we test it through the public `upsertProject`
// surface — it's the only safeUpsert site that matters for correctness, and it lets us
// pin the actual behaviour callers depend on (skip when remote newer, write when local
// newer, write when no remote row exists).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installBrowserEnv, resetBrowserEnv } from '../test/setup-browser-env'
installBrowserEnv()

// Capture calls so each test can assert what was sent to Supabase. The mock is the same
// shape as @supabase/supabase-js's chainable builder: from(...).select().eq().maybeSingle()
// for the conflict check, and from(...).upsert() for the write.
const calls: Array<{ op: string; table: string; payload?: unknown; selectedId?: string }> = []
let remoteRow: { updated_at?: string } | null = null
let upsertError: { message: string } | null = null

vi.mock('./supabase', () => {
  const supabase = {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_col: string, value: string) {
              calls.push({ op: 'select', table, selectedId: value })
              return {
                maybeSingle: async () => ({ data: remoteRow, error: null }),
              }
            },
            order() { return this },
          }
        },
        upsert(payload: unknown) {
          calls.push({ op: 'upsert', table, payload })
          return Promise.resolve({ error: upsertError })
        },
      }
    },
  }
  return {
    supabase,
    isSupabaseConfigured: () => true,
  }
})

import { upsertProject } from './storageAsync'
import { saveProject } from './storage'
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
  calls.length = 0
  remoteRow = null
  upsertError = null
})

describe('safeUpsert (via upsertProject)', () => {
  it('writes when no remote row exists', async () => {
    remoteRow = null  // simulates a new row that's never been synced
    await upsertProject(project({ id: 'p1' }))

    const upserts = calls.filter(c => c.op === 'upsert')
    expect(upserts).toHaveLength(1)
    expect(upserts[0].table).toBe('fg_projects')
  })

  it('writes when local updated_at is newer than remote', async () => {
    // Remote was last touched a week ago
    remoteRow = { updated_at: new Date(Date.now() - 7 * 86400000).toISOString() }
    await upsertProject(project({ id: 'p1' }))

    expect(calls.some(c => c.op === 'upsert')).toBe(true)
  })

  it('skips when remote updated_at is newer than local', async () => {
    // Save locally first → gets a fresh updatedAt stamp
    saveProject(project({ id: 'p1' }))
    // Then claim the remote is from the future (representing another device's later edit)
    remoteRow = { updated_at: new Date(Date.now() + 60 * 1000).toISOString() }

    await upsertProject(project({ id: 'p1' }))

    // Select happened (the conflict check), but the upsert was refused
    expect(calls.some(c => c.op === 'select')).toBe(true)
    expect(calls.some(c => c.op === 'upsert')).toBe(false)
  })

  it('writes when timestamps are equal (treats equal as not-newer)', async () => {
    // Edge: race within the same millisecond. We accept the write — better to risk a tiny
    // double-write than to silently drop a legitimate edit.
    saveProject(project({ id: 'p1' }))
    const local = JSON.parse(globalThis.localStorage.getItem('fg_projects')!)[0]
    remoteRow = { updated_at: local.updatedAt }

    await upsertProject(project({ id: 'p1' }))
    expect(calls.some(c => c.op === 'upsert')).toBe(true)
  })

  it('still attempts the select round-trip even with no local stamp', async () => {
    // Defensive: if for some reason updatedAt isn't on the row, safeUpsert should still
    // try the remote check rather than blind-overwriting.
    remoteRow = { updated_at: new Date(Date.now() + 60 * 1000).toISOString() }
    // Save bypasses the auto-stamp by writing directly to localStorage
    globalThis.localStorage.setItem('fg_projects', JSON.stringify([project({ id: 'p1' })]))
    await upsertProject(project({ id: 'p1' }))

    expect(calls.some(c => c.op === 'select' && c.selectedId === 'p1')).toBe(true)
  })

  it('still writes (rather than throws) when Supabase upsert errors', async () => {
    // safeUpsert returns { wrote: false, skippedReason } on error — upsertProject doesn't
    // observe the return, so the localStorage write still succeeds and the caller can
    // continue. We're verifying the no-throw contract here.
    remoteRow = null
    upsertError = { message: 'simulated network failure' }
    await expect(upsertProject(project({ id: 'p1' }))).resolves.not.toThrow()
    // localStorage write still happened (it's the first thing upsertProject does)
    expect(JSON.parse(globalThis.localStorage.getItem('fg_projects')!)).toHaveLength(1)
  })
})
