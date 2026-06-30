// Pure newest-wins merge shared by the realtime live-sync (lib/liveSync.ts). Kept dependency-free so
// it's unit-testable without dragging in the supabase/storage import graph.

export type Keyed = { id: string; updatedAt?: string }

/**
 * True when `remote` is a strictly newer timestamp than `local`. A missing remote never wins; a
 * missing local always loses (so a brand-new remote row is adopted). Parse both as dates — Supabase
 * serialises "2026-06-12 07:32:35+00" while the app writes ISO "2026-06-12T07:32:35Z", and a raw
 * string compare ranks the space-form below the T-form regardless of actual time. Fall back to a
 * string compare only if either is unparseable.
 */
export function isNewer(remote?: string, local?: string): boolean {
  if (!remote) return false
  if (!local) return true
  const pr = Date.parse(remote)
  const pl = Date.parse(local)
  return Number.isFinite(pr) && Number.isFinite(pl) ? pr > pl : remote > local
}

/**
 * Merge remote rows into local with newest-wins by id, PRESERVING local-only rows (ones the remote
 * doesn't have yet, e.g. a record created on this device but not pushed). Returns the merged array
 * and whether anything changed (so the caller can skip a write + notify when nothing moved).
 *
 * `keepLocalOnly` (optional): decides whether a LOCAL-ONLY row (absent from remote) is kept. Default
 * keeps everything (the safe default). Datasets that are authoritatively owned by the DB and get
 * regenerated wholesale (the Gantt revenue forecast — deleted + re-inserted with fresh ids each time)
 * pass a predicate that drops stale local rows the remote has replaced, so they don't accumulate on a
 * device that wasn't connected during the regeneration. It must be conservative (return true to KEEP)
 * so a device's own freshly-generated rows aren't pruned before they reach the DB.
 */
export function mergeKeyed<T extends Keyed>(
  local: T[],
  remote: T[],
  keepLocalOnly?: (row: T, remote: T[]) => boolean,
): { merged: T[]; changed: boolean } {
  const byId = new Map(local.map(r => [r.id, r]))
  const remoteIds = new Set(remote.map(r => r.id))
  let changed = false
  for (const r of remote) {
    if (!r || !r.id) continue
    const cur = byId.get(r.id)
    if (!cur || isNewer(r.updatedAt, cur.updatedAt)) { byId.set(r.id, r); changed = true }
  }
  if (keepLocalOnly) {
    for (const r of local) {
      if (!remoteIds.has(r.id) && !keepLocalOnly(r, remote)) { byId.delete(r.id); changed = true }
    }
  }
  return { merged: Array.from(byId.values()), changed }
}
