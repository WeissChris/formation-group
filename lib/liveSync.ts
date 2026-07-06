// Realtime cross-device sync.
//
// The login hydrate only pulls rows that are MISSING locally (add-missing), and it only runs on
// app load — so an edit made on computer A to a record computer B already has never arrived, and
// even new records lagged until B reloaded. This module closes both gaps:
//
//   1. newest-wins merge — pull a remote row whenever its `updatedAt` is newer than the local copy
//      (not just when the row is missing), so edits propagate.
//   2. Supabase Realtime — a Postgres-changes subscription re-pulls the affected dataset within
//      ~1s of any insert/update/delete on another device, so it's live, not reload-gated.
//
// IMPORTANT: remote rows are written straight into the localStorage array here, NOT through the
// save* helpers — those re-stamp `updatedAt` to now, which would both corrupt the newest-wins
// comparison and create an endless A→B→A timestamp-bump echo. Local-only rows (not yet pushed to
// Supabase) are always preserved. After a merge we fire notifyThisTab() (BroadcastChannel doesn't
// echo to the tab running this code) plus notify() for any sibling tabs, and the existing
// useCrossTabRefresh consumers re-read from storage.

import { supabase, isSupabaseConfigured } from './supabase'
import {
  getEstimates, getProjects, getProposals, getRevenue, getAllGanttEntries,
  getActuals, getPaymentStages, getProgressClaims, getSubcontractors, getDesignProjects, getSupervisors,
  getLibraryItems, getEstimateTemplates,
} from './storageAsync'
import { notify, notifyThisTab, type StorageEvent } from './broadcast'
import { mergeKeyed, type Keyed } from './mergeKeyed'

interface Dataset {
  table: string
  lsKey: string
  bcKey: StorageEvent['key']
  getRemote: () => Promise<Keyed[]>
  // Optional: drop stale local-only rows the DB has replaced (see mergeKeyed). Return true to KEEP.
  keepLocalOnly?: (row: Keyed, remote: Keyed[]) => boolean
}

// A Gantt forecast revenue row carries its category-line in `notes` ending "(Gantt)". The forecast is
// regenerated wholesale (delete + re-insert with fresh ids), so a local "(Gantt)" row the remote no
// longer has is stale and must be pruned — but only when the remote actually holds this project's
// forecast (otherwise we'd prune a device's own freshly-generated rows mid-push, or offline edits).
function keepRevenueRow(row: Keyed, remote: Keyed[]): boolean {
  const r = row as { notes?: string; projectId?: string }
  const isGantt = (r.notes ?? '').trim().endsWith('(Gantt)')
  if (!isGantt) return true   // manual rows are user-owned — never prune
  return !remote.some(x => {
    const xr = x as { notes?: string; projectId?: string }
    return xr.projectId === r.projectId && (xr.notes ?? '').trim().endsWith('(Gantt)')
  })
}

// Only datasets whose save helpers stamp `updatedAt` AND notify() qualify for newest-wins realtime.
// (Design projects don't stamp updatedAt, so they stay on the add-missing login hydrate for now.)
const DATASETS: Dataset[] = [
  { table: 'fg_estimates', lsKey: 'fg_estimates', bcKey: 'estimates', getRemote: getEstimates as () => Promise<Keyed[]> },
  { table: 'fg_projects', lsKey: 'fg_projects', bcKey: 'projects', getRemote: getProjects as () => Promise<Keyed[]> },
  { table: 'fg_proposals', lsKey: 'fg_proposals', bcKey: 'proposals', getRemote: getProposals as () => Promise<Keyed[]> },
  { table: 'fg_revenue', lsKey: 'fg_revenue', bcKey: 'revenue', getRemote: getRevenue as () => Promise<Keyed[]>, keepLocalOnly: keepRevenueRow },
  // Gantt stores every project's entries in one flat 'fg_gantt' array keyed by entry id, so it fits the
  // per-row newest-wins merge directly. upsertGanttEntries stamps updatedAt + notifies, so it qualifies.
  { table: 'fg_gantt', lsKey: 'fg_gantt', bcKey: 'gantt', getRemote: getAllGanttEntries as () => Promise<Keyed[]> },
  // The remaining internal datasets: each is one flat localStorage array keyed by id, its saver stamps
  // updatedAt + notifies, and its getter returns rows carrying updatedAt (blob datasets carry it inside
  // the blob). That's everything the per-row newest-wins merge needs.
  { table: 'fg_actuals', lsKey: 'fg_actuals', bcKey: 'actuals', getRemote: getActuals as () => Promise<Keyed[]> },
  { table: 'fg_payment_stages', lsKey: 'fg_payment_stages', bcKey: 'payment_stages', getRemote: getPaymentStages as () => Promise<Keyed[]> },
  { table: 'fg_progress_claims', lsKey: 'fg_progress_claims', bcKey: 'progress_claims', getRemote: getProgressClaims as () => Promise<Keyed[]> },
  { table: 'fg_subcontractors', lsKey: 'fg_subcontractors', bcKey: 'subcontractors', getRemote: getSubcontractors as () => Promise<Keyed[]> },
  { table: 'fg_design_projects', lsKey: 'fg_design_projects', bcKey: 'design_projects', getRemote: getDesignProjects as () => Promise<Keyed[]> },
  { table: 'fg_supervisors', lsKey: 'fg_supervisors', bcKey: 'supervisors', getRemote: getSupervisors as () => Promise<Keyed[]> },
  // Estimate template library: saved line items (custom item library) + full-estimate templates.
  { table: 'fg_library_items', lsKey: 'fg_library', bcKey: 'library', getRemote: getLibraryItems as () => Promise<Keyed[]> },
  { table: 'fg_estimate_templates', lsKey: 'fg_estimate_templates', bcKey: 'estimate_templates', getRemote: getEstimateTemplates as () => Promise<Keyed[]> },
]

function readLocal(lsKey: string): Keyed[] {
  try {
    const v = JSON.parse(localStorage.getItem(lsKey) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Merge remote rows into localStorage with newest-wins, preserving local-only rows (unless pruned). */
function mergeRemote(lsKey: string, remote: Keyed[], keepLocalOnly?: (row: Keyed, remote: Keyed[]) => boolean): boolean {
  const { merged, changed } = mergeKeyed(readLocal(lsKey), remote, keepLocalOnly)
  if (changed) localStorage.setItem(lsKey, JSON.stringify(merged))
  return changed
}

/** Remove a row another device deleted. */
function removeLocal(lsKey: string, id: string): boolean {
  const local = readLocal(lsKey)
  const next = local.filter(r => r.id !== id)
  if (next.length === local.length) return false
  localStorage.setItem(lsKey, JSON.stringify(next))
  return true
}

function announce(bcKey: StorageEvent['key']): void {
  notifyThisTab({ key: bcKey }) // this tab (the one running live-sync)
  notify({ key: bcKey })        // sibling tabs in this browser
}

async function resync(ds: Dataset): Promise<void> {
  try {
    if (mergeRemote(ds.lsKey, await ds.getRemote(), ds.keepLocalOnly)) announce(ds.bcKey)
  } catch (e) {
    console.warn('[liveSync] resync failed', ds.table, e)
  }
}

let started = false

/**
 * Start realtime cross-device sync. Idempotent (singleton); returns an unsubscribe function.
 * No-op when Supabase isn't configured or on the server.
 */
export function startLiveSync(): () => void {
  if (started || typeof window === 'undefined' || !isSupabaseConfigured() || !supabase) return () => {}
  started = true
  const client = supabase

  // Initial newest-wins catch-up for edits made while this device was closed.
  DATASETS.forEach(ds => { void resync(ds) })

  // Coalesce a burst of row writes on one table into a single re-pull.
  const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}
  const scheduleResync = (ds: Dataset) => {
    if (timers[ds.table]) clearTimeout(timers[ds.table])
    timers[ds.table] = setTimeout(() => { void resync(ds) }, 350)
  }

  const channel = client.channel('formation-live')
  for (const ds of DATASETS) {
    // The realtime `.on('postgres_changes', …)` overload types are version-sensitive; cast the event
    // tag to sidestep overload friction. The handler body stays typed (no `any` leaks past here).
    channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: ds.table },
      (payload: { eventType?: string; old?: Record<string, unknown> }) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id as string | undefined
          if (id && removeLocal(ds.lsKey, id)) announce(ds.bcKey)
        } else {
          scheduleResync(ds)
        }
      },
    )
  }
  channel.subscribe()

  return () => {
    started = false
    Object.values(timers).forEach(t => t && clearTimeout(t))
    try { void client.removeChannel(channel) } catch { /* ignore */ }
  }
}
