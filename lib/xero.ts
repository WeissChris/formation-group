// Client-side Xero helpers — thin wrappers around server proxy routes.
//
// Tokens used to live in localStorage and pass through URL query strings on the OAuth
// callback. They now live in the `fg_xero_tokens` Supabase row (accessed only via the
// service role key) and are never exposed to the browser. Every Xero API call goes through
// a server proxy under /api/xero/.
//
// Direct token access (getXeroTokens, saveXeroTokens, clearXeroTokens) was removed because
// nothing legitimate needs it client-side — and exposing them at all undid the whole point
// of the migration.

export interface XeroStatus {
  connected: boolean
  tenantName?: string
  expiresAt?: number
  configured: boolean  // false when SUPABASE_SERVICE_ROLE_KEY isn't set
}

/**
 * Fetch a Xero OAuth init URL from the server.
 * Server generates a crypto-random `state` and sets it as an httpOnly cookie that the
 * callback validates — closes the CSRF gap on the OAuth flow.
 */
export async function getXeroAuthUrl(): Promise<string | null> {
  try {
    const resp = await fetch('/api/xero/init')
    if (!resp.ok) return null
    const data = await resp.json()
    return typeof data.url === 'string' ? data.url : null
  } catch {
    return null
  }
}

/** Fetch the current Xero connection status. Safe for the client — exposes only metadata. */
export async function getXeroStatus(): Promise<XeroStatus> {
  try {
    const resp = await fetch('/api/xero/status', { cache: 'no-store' })
    if (!resp.ok) return { connected: false, configured: false }
    return await resp.json()
  } catch {
    return { connected: false, configured: false }
  }
}

/** Disconnect Xero (deletes the server-side tokens row). */
export async function disconnectXero(): Promise<boolean> {
  try {
    const resp = await fetch('/api/xero/disconnect', { method: 'POST' })
    if (!resp.ok) return false
    const data = await resp.json()
    return !!data.ok
  } catch {
    return false
  }
}

// ── Data accessors (server-proxied) ──────────────────────────────────────────

export async function getXeroBills(_projectTrackingCategory?: string): Promise<unknown[]> {
  try {
    const resp = await fetch('/api/xero/bills', { cache: 'no-store' })
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

export async function getXeroInvoices(): Promise<unknown[]> {
  try {
    const resp = await fetch('/api/xero/invoices', { cache: 'no-store' })
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

export async function getXeroTrackingCategories(): Promise<unknown[]> {
  try {
    const resp = await fetch('/api/xero/tracking-categories', { cache: 'no-store' })
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

// ── Live job data wrappers ───────────────────────────────────────────────────

export interface TrackingOption { id: string; name: string }
export interface TrackingCategory { id: string; name: string; options: TrackingOption[] }

/** List Xero tracking categories with their options. Used by the mapping UI. */
export async function getTrackingOptions(): Promise<TrackingCategory[]> {
  try {
    const resp = await fetch('/api/xero/tracking-options', { cache: 'no-store' })
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

export interface XeroSyncStatus {
  configured: boolean
  mapped_project_count?: number
  last_run?: {
    id: number
    started_at: string
    finished_at: string | null
    trigger: string
    status: 'running' | 'ok' | 'error'
    bills_processed: number | null
    projects_updated: number | null
    error_message: string | null
  } | null
}

export async function getXeroSyncStatus(): Promise<XeroSyncStatus> {
  try {
    const resp = await fetch('/api/xero/sync-status', { cache: 'no-store' })
    if (!resp.ok) return { configured: false }
    return await resp.json()
  } catch {
    return { configured: false }
  }
}

export interface SyncResult {
  ok: boolean
  bills_processed: number
  spend_money_processed?: number
  projects_updated: number
  error?: string
}

/** Trigger a manual full sync. Returns counts. Debounce client-side. */
export async function triggerXeroSync(): Promise<SyncResult> {
  try {
    const resp = await fetch('/api/xero/sync-now', { method: 'POST' })
    return await resp.json()
  } catch (e) {
    return { ok: false, bills_processed: 0, projects_updated: 0, error: e instanceof Error ? e.message : 'network' }
  }
}

export interface ProjectXeroMapping {
  project_id: string
  tracking_category_id: string
  tracking_option_id: string
  tracking_option_name: string
  updated_at: string
}

export async function getProjectMapping(projectId: string): Promise<ProjectXeroMapping | null> {
  try {
    const resp = await fetch(`/api/projects/${projectId}/xero-mapping`, { cache: 'no-store' })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.mapping ?? null
  } catch {
    return null
  }
}

export async function setProjectMapping(
  projectId: string,
  mapping: { tracking_category_id?: string; tracking_option_id?: string; tracking_option_name?: string } | null,
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/projects/${projectId}/xero-mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping ?? {}),
    })
    if (!resp.ok) return false
    const data = await resp.json()
    return !!data.ok
  } catch {
    return false
  }
}

export interface ProjectCostRow {
  account_code: string
  account_name: string
  amount_ex_gst: number
  bill_count: number
  last_bill_date: string | null
  pulled_at: string
  forecast_final: number | null
  comment: string | null
}

export interface ProjectCostsResponse {
  costs: ProjectCostRow[]
  cost_to_date: number
  mapped: boolean
  mapping: ProjectXeroMapping | null
  last_pulled_at: string | null
}

export async function getProjectCosts(projectId: string): Promise<ProjectCostsResponse> {
  try {
    const resp = await fetch(`/api/projects/${projectId}/costs`, { cache: 'no-store' })
    if (!resp.ok) return { costs: [], cost_to_date: 0, mapped: false, mapping: null, last_pulled_at: null }
    return await resp.json()
  } catch {
    return { costs: [], cost_to_date: 0, mapped: false, mapping: null, last_pulled_at: null }
  }
}

export interface LiveJobRow {
  project_id: string
  cost_to_date: number
  forecast_final_cost: number
  last_pulled_at: string | null
  mapped: boolean
}

export async function getLiveJobs(): Promise<{ items: LiveJobRow[]; configured: boolean }> {
  try {
    const resp = await fetch('/api/xero/live-jobs', { cache: 'no-store' })
    if (!resp.ok) return { items: [], configured: false }
    return await resp.json()
  } catch {
    return { items: [], configured: false }
  }
}

/**
 * Manually trigger a snapshot of the current Live Jobs view. The browser computes the
 * rows (because progress claims are localStorage-only) and POSTs them to the server, which
 * writes them to fg_project_snapshots dated to today (Australia/Melbourne).
 *
 * Returns { ok, snapshotted, skipped_duplicate, snapshot_date }. skipped_duplicate fires
 * when a snapshot for the same date already exists (the unique constraint blocks dupes).
 */
export interface SnapshotInputForApi {
  /** LiveJobRow from lib/liveJobs.ts */
  row: unknown
  /** {account_code: amount} map at snapshot time */
  costByAccount: Record<string, number>
}
export interface SnapshotNowResult {
  ok: boolean
  snapshotted: number
  skipped_duplicate: number
  snapshot_date?: string
  error?: string
}
export async function triggerManualSnapshot(inputs: SnapshotInputForApi[]): Promise<SnapshotNowResult> {
  try {
    const resp = await fetch('/api/snapshots/now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }),
    })
    return await resp.json()
  } catch (e) {
    return { ok: false, snapshotted: 0, skipped_duplicate: 0, error: e instanceof Error ? e.message : 'network' }
  }
}

/**
 * Save a per-account forecast override + comment on a project.
 * Pass forecast_final=null AND comment='' (or null) to clear the override entirely.
 */
export async function setProjectCostForecast(
  projectId: string,
  accountCode: string,
  forecastFinal: number | null,
  comment: string | null,
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/projects/${projectId}/costs/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_code: accountCode,
        forecast_final: forecastFinal,
        comment,
      }),
    })
    if (!resp.ok) return false
    const data = await resp.json()
    return !!data.ok
  } catch {
    return false
  }
}
