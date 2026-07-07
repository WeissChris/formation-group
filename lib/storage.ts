import type { Project, WeeklyRevenue, DesignProposal, Estimate, GanttEntry, WeeklyActual, ProgressPaymentStage, DesignProject, ProgressClaim, TakeoffData, TakeoffTemplate, ProposalInvoiceStage, SubcontractorPackage, Supervisor, EstimateTemplate, OpcSnippet } from '@/types'
import { notify } from './broadcast'
import { getProposalPhases, phasesTotal } from './proposalPhases'
import { generateId } from './utils'

// ── IndexedDB backup (large-quota durable store, mirrors every localStorage write) ───────────────
//
// IMPORTANT: open the DB through openBackupDB() ONLY. Every open MUST create the 'backup' object
// store in onupgradeneeded. A previous version of recoverFromIndexedDB opened the DB with NO
// onupgradeneeded, so when it ran first (on app load, before any save) it created an empty store-
// less database; thereafter every backup silently failed (the store could never be created at the
// same version). The version bump to 2 forces an upgrade on those broken DBs so the store is added.
const BACKUP_DB = 'FormationGroupBackup'
const BACKUP_DB_VERSION = 2
const BACKUP_STORE = 'backup'

function openBackupDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(BACKUP_DB, BACKUP_DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(BACKUP_STORE)) db.createObjectStore(BACKUP_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        // Defensive: if the store is somehow still missing, the DB is unusable for backup.
        if (!db.objectStoreNames.contains(BACKUP_STORE)) { resolve(null); return }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}

// Backup runs after every localStorage write. Resolves true once durably committed (tx.oncomplete),
// false on any failure — so callers handling data too large for localStorage (takeoffs with plan
// images) can tell whether the durable copy actually landed.
export function backupToIndexedDB(key: string, data: unknown[]): Promise<boolean> {
  return openBackupDB().then(db => {
    if (!db) return false
    return new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(BACKUP_STORE, 'readwrite')
        tx.objectStore(BACKUP_STORE).put({ data, timestamp: new Date().toISOString() }, key)
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
        tx.onabort = () => resolve(false)
      } catch (e) { console.warn('[Formation] IndexedDB backup failed:', e); resolve(false) }
    })
  })
}

// Read one backup key straight from IndexedDB (datasets too large for localStorage live only here).
export function loadKeyFromIndexedDB(key: string): Promise<unknown[] | null> {
  return openBackupDB().then(db => {
    if (!db) return null
    return new Promise<unknown[] | null>((resolve) => {
      try {
        const req = db.transaction(BACKUP_STORE, 'readonly').objectStore(BACKUP_STORE).get(key)
        req.onsuccess = () => resolve((req.result?.data as unknown[]) ?? null)
        req.onerror = () => resolve(null)
      } catch { resolve(null) }
    })
  })
}

// Recovery from IndexedDB when localStorage is empty
export async function recoverFromIndexedDB(): Promise<boolean> {
  const db = await openBackupDB()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BACKUP_STORE, 'readonly')
      const store = tx.objectStore(BACKUP_STORE)
      const keys = ['fg_projects', 'fg_proposals', 'fg_estimates', 'fg_revenue', 'fg_gantt', 'fg_actuals', 'fg_payment_stages', 'fg_design_projects', 'fg_progress_claims']
      let recovered = false
      keys.forEach(k => {
        const req = store.get(k)
        req.onsuccess = () => {
          if (req.result?.data && !localStorage.getItem(k)) {
            localStorage.setItem(k, JSON.stringify(req.result.data))
            recovered = true
          }
        }
      })
      tx.oncomplete = () => resolve(recovered)
      tx.onerror = () => resolve(false)
    } catch { resolve(false) }
  })
}

// Projects
export function saveProject(project: Project): void {
  // Stamp updatedAt on every save — drives Supabase conflict resolution (a remote row newer
  // than this stamp won't be clobbered on next sync). Callers don't need to set it themselves.
  const stamped = { ...project, updatedAt: new Date().toISOString() }
  const all = loadProjects()
  const idx = all.findIndex(p => p.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  try {
    localStorage.setItem('fg_projects', JSON.stringify(all))
  } catch (e) {
    // QuotaExceededError — a full localStorage (usually big estimate/takeoff payloads) must not crash
    // the caller: the project page auto-restores/fixes projects during LOAD, and an uncaught throw here
    // left it on an infinite "Loading..." spinner. Persist is best-effort; Supabase still has the data.
    console.warn('saveProject: localStorage persist failed (quota?) — continuing without local save', e)
    return
  }
  backupToIndexedDB('fg_projects', loadProjects())
  notify({ key: 'projects' })
}

export function loadProjects(): Project[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_projects') || '[]') } catch { return [] }
}

export function deleteProject(id: string): void {
  const all = loadProjects().filter(p => p.id !== id)
  localStorage.setItem('fg_projects', JSON.stringify(all))
  backupToIndexedDB('fg_projects', all)
  notify({ key: 'projects' })
}

// Weekly revenue entries
export function saveWeeklyRevenue(entry: WeeklyRevenue): void {
  const stamped = { ...entry, updatedAt: new Date().toISOString() }
  const all = loadWeeklyRevenue()
  const idx = all.findIndex(w => w.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  localStorage.setItem('fg_revenue', JSON.stringify(all))
  backupToIndexedDB('fg_revenue', loadWeeklyRevenue())
  notify({ key: 'revenue' })
}

export function loadWeeklyRevenue(): WeeklyRevenue[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_revenue') || '[]') } catch { return [] }
}

export function deleteWeeklyRevenue(id: string): void {
  const all = loadWeeklyRevenue().filter(w => w.id !== id)
  localStorage.setItem('fg_revenue', JSON.stringify(all))
  backupToIndexedDB('fg_revenue', all)
  notify({ key: 'revenue' })
}

// Design proposals
export function saveProposal(proposal: DesignProposal): void {
  const stamped = { ...proposal, updatedAt: new Date().toISOString() }
  const all = loadProposals()
  const idx = all.findIndex(p => p.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  localStorage.setItem('fg_proposals', JSON.stringify(all))
  backupToIndexedDB('fg_proposals', loadProposals())
  notify({ key: 'proposals' })
}

export function loadProposals(): DesignProposal[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_proposals') || '[]') } catch { return [] }
}

export function deleteProposal(id: string): void {
  const all = loadProposals().filter(p => p.id !== id)
  localStorage.setItem('fg_proposals', JSON.stringify(all))
  backupToIndexedDB('fg_proposals', all)
  notify({ key: 'proposals' })
}

// Estimates
export function saveEstimate(estimate: Estimate): void {
  const stamped = { ...estimate, updatedAt: new Date().toISOString() }
  const all = loadEstimates()
  const idx = all.findIndex(e => e.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  try {
    localStorage.setItem('fg_estimates', JSON.stringify(all))
  } catch {
    // QuotaExceededError — the browser store is full (usually big attached quote files). The estimate
    // still reaches Supabase (upsertEstimate pushes the in-memory copy, not this failed write), so the
    // work is safe in the cloud — but THIS device will show stale data until space is freed. Warn once.
    if (typeof window !== 'undefined' && !sessionStorage.getItem('fg_estimates_quota_warned')) {
      try { sessionStorage.setItem('fg_estimates_quota_warned', '1') } catch { /* ignore */ }
      try { window.alert('This browser’s storage is full, so the estimate was saved to the cloud only. Your changes are safe and will sync, but this device may show old data until space is freed — remove a large attached quote file if this keeps appearing.') } catch { /* ignore */ }
    }
    return
  }
  backupToIndexedDB('fg_estimates', loadEstimates())
  notify({ key: 'estimates' })
}

export function loadEstimates(): Estimate[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_estimates') || '[]') } catch { return [] }
}

export function loadEstimatesByProject(projectId: string): Estimate[] {
  return loadEstimates().filter(e => e.projectId === projectId)
}

export function deleteEstimate(id: string): void {
  const all = loadEstimates().filter(e => e.id !== id)
  localStorage.setItem('fg_estimates', JSON.stringify(all))
  backupToIndexedDB('fg_estimates', all)
  notify({ key: 'estimates' })
}

// Gantt entries
export function saveGanttEntries(projectId: string, entries: GanttEntry[]): void {
  const all = loadAllGanttEntries()
  const filtered = all.filter(e => e.projectId !== projectId)
  const merged = [...filtered, ...entries]
  localStorage.setItem('fg_gantt', JSON.stringify(merged))
  backupToIndexedDB('fg_gantt', merged)
}

export function loadGanttEntries(projectId: string): GanttEntry[] {
  return loadAllGanttEntries().filter(e => e.projectId === projectId)
}

function loadAllGanttEntries(): GanttEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_gantt') || '[]') } catch { return [] }
}

// Weekly actuals
export function saveWeeklyActual(actual: WeeklyActual): void {
  // Stamp updatedAt on every save — drives Supabase conflict resolution (safeUpsert won't clobber a
  // remote row newer than this stamp). Callers don't need to set it themselves.
  const stamped = { ...actual, updatedAt: new Date().toISOString() }
  const all = loadWeeklyActuals()
  const idx = all.findIndex(a => a.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  localStorage.setItem('fg_actuals', JSON.stringify(all))
  backupToIndexedDB('fg_actuals', loadWeeklyActuals())
  notify({ key: 'actuals' })
}

export function loadWeeklyActuals(projectId?: string): WeeklyActual[] {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem('fg_actuals') || '[]')
    return projectId ? all.filter((a: WeeklyActual) => a.projectId === projectId) : all
  } catch { return [] }
}

export function deleteWeeklyActualsByProject(projectId: string): void {
  const all = loadWeeklyActuals().filter(a => a.projectId !== projectId)
  localStorage.setItem('fg_actuals', JSON.stringify(all))
  backupToIndexedDB('fg_actuals', all)
}

// Delete all WeeklyRevenue entries for a project (for Gantt forecast regeneration).
// Destructive — wipes hand-entered deposits/milestones too. Callers should generally prefer
// `deleteGanttGeneratedRevenueByProject` to preserve manual entries.
export function deleteWeeklyRevenueByProject(projectId: string): void {
  const all = loadWeeklyRevenue().filter(w => w.projectId !== projectId)
  localStorage.setItem('fg_revenue', JSON.stringify(all))
  backupToIndexedDB('fg_revenue', all)
}

// Delete only Gantt-originated WeeklyRevenue entries for a project (notes end with "(Gantt)").
// Preserves manual entries (deposits, milestones, anything notes-tagged differently).
// This is the non-destructive partner to use during Gantt forecast regeneration.
export function deleteGanttGeneratedRevenueByProject(projectId: string): void {
  const all = loadWeeklyRevenue().filter(w => {
    if (w.projectId !== projectId) return true
    // Keep anything that wasn't tagged as Gantt-generated.
    return !(w.notes ?? '').trim().endsWith('(Gantt)')
  })
  localStorage.setItem('fg_revenue', JSON.stringify(all))
  backupToIndexedDB('fg_revenue', all)
}

// Progress Payment Stages
export function saveProgressPaymentStage(stage: ProgressPaymentStage): void {
  // Stamp updatedAt on every save — drives Supabase conflict resolution (safeUpsert won't clobber a
  // remote row newer than this stamp). Callers don't need to set it themselves.
  const stamped = { ...stage, updatedAt: new Date().toISOString() }
  const all = loadProgressPaymentStages()
  const idx = all.findIndex(s => s.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  localStorage.setItem('fg_payment_stages', JSON.stringify(all))
  backupToIndexedDB('fg_payment_stages', loadProgressPaymentStages())
  notify({ key: 'payment_stages' })
}

export function loadProgressPaymentStages(projectId?: string): ProgressPaymentStage[] {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem('fg_payment_stages') || '[]')
    return projectId ? all.filter((s: ProgressPaymentStage) => s.projectId === projectId) : all
  } catch { return [] }
}

export function deleteProgressPaymentStage(id: string): void {
  const all = loadProgressPaymentStages().filter(s => s.id !== id)
  localStorage.setItem('fg_payment_stages', JSON.stringify(all))
  backupToIndexedDB('fg_payment_stages', all)
  notify({ key: 'payment_stages' })
}

export function deleteProgressPaymentStagesByProject(projectId: string): void {
  const all = loadProgressPaymentStages().filter(s => s.projectId !== projectId)
  localStorage.setItem('fg_payment_stages', JSON.stringify(all))
  backupToIndexedDB('fg_payment_stages', all)
}

// Design Projects
export function saveDesignProject(project: DesignProject): void {
  // Stamp updatedAt on every save so cross-device newest-wins works (see liveSync); notify so an open
  // design-tracker view refreshes.
  const stamped = { ...project, updatedAt: new Date().toISOString() }
  const all = loadDesignProjects()
  const idx = all.findIndex(p => p.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  localStorage.setItem('fg_design_projects', JSON.stringify(all))
  backupToIndexedDB('fg_design_projects', loadDesignProjects())
  notify({ key: 'design_projects' })
}

export function loadDesignProjects(): DesignProject[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_design_projects') || '[]') } catch { return [] }
}

export function loadDesignProjectByProposalId(proposalId: string): DesignProject | null {
  return loadDesignProjects().find(p => p.proposalId === proposalId) || null
}

/**
 * Build the design-delivery tracker row for an accepted proposal. Shared by the manual office
 * "accept" path and the auto-reconcile path so the two can't drift. Does NOT save — caller persists.
 */
export function buildDesignProjectFromProposal(proposal: DesignProposal): DesignProject {
  const p1DueDate = new Date()
  p1DueDate.setDate(p1DueDate.getDate() + 42)
  const total = phasesTotal(getProposalPhases(proposal))
  return {
    id: generateId(),
    proposalId: proposal.id,
    clientName: proposal.clientName,
    projectAddress: proposal.projectAddress || '',
    entity: 'design',
    phase1Fee: proposal.phase1Fee,
    phase1Status: 'not_started',
    phase1DueDate: p1DueDate.toISOString().split('T')[0],
    phase1DepositPaid: false,
    phase2Fee: proposal.phase2Fee,
    phase2Status: 'not_started',
    phase3Fee: proposal.phase3Fee,
    phase3Status: proposal.phase3Fee ? 'not_started' : undefined,
    totalFee: total,
    totalPaid: 0,
    totalOutstanding: total,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: proposal.acceptedAt,
  }
}

// Progress Claims
export function saveProgressClaim(claim: ProgressClaim): void {
  // Stamp updatedAt (carried inside the jsonb blob, which getProgressClaims reads back) so cross-device
  // newest-wins works; notify so an open claims view refreshes.
  const stamped = { ...claim, updatedAt: new Date().toISOString() }
  const all = loadProgressClaims()
  const idx = all.findIndex(c => c.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  localStorage.setItem('fg_progress_claims', JSON.stringify(all))
  backupToIndexedDB('fg_progress_claims', all)
  notify({ key: 'progress_claims' })
}

export function loadProgressClaims(projectId?: string): ProgressClaim[] {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem('fg_progress_claims') || '[]')
    return projectId ? all.filter((c: ProgressClaim) => c.projectId === projectId) : all
  } catch { return [] }
}

export function deleteProgressClaim(id: string): void {
  const all = loadProgressClaims().filter(c => c.id !== id)
  localStorage.setItem('fg_progress_claims', JSON.stringify(all))
  backupToIndexedDB('fg_progress_claims', all)
  notify({ key: 'progress_claims' })
}

// Takeoff data
//
// Takeoffs embed plan images as base64 data URIs, which routinely exceed the ~5MB localStorage
// quota. localStorage is therefore a best-effort fast cache; IndexedDB (much larger quota) is the
// durable store. Every save stamps `updatedAt` so the loader can pick the freshest of the two.
let takeoffQuotaWarned = false
export function saveTakeoff(data: TakeoffData): TakeoffData {
  const stamped: TakeoffData = { ...data, updatedAt: new Date().toISOString() }
  const all = loadAllTakeoffs()
  const idx = all.findIndex(t => t.estimateId === stamped.estimateId)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  let localOk = true
  try {
    // The localStorage copy carries NO base64 plan images: a single plan is megabytes, and the
    // ~5MB quota is SHARED with every other store — a big takeoff didn't just fail its own save,
    // it starved fg_estimates and the rest into QuotaExceeded failures. Images live in the full
    // IndexedDB copy below (and Supabase Storage); loadTakeoffAsync grafts them back on read.
    const stripped = all.map(t => ({
      ...t,
      plans: t.plans.map(p => typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:') ? { ...p, dataUrl: '' } : p),
    }))
    localStorage.setItem('fg_takeoffs', JSON.stringify(stripped))
  } catch (e) {
    // Still too big (huge measurement sets). Swallow so the throw doesn't abort the React state
    // update; IndexedDB below is the durable store and the loader reads it back.
    localOk = false
    console.error('[takeoff] localStorage save failed (likely quota); relying on IndexedDB', e)
  }
  // IndexedDB is the durable store. Only warn the user if BOTH stores fail — then the change really
  // is memory-only and at risk on reload.
  void backupToIndexedDB('fg_takeoffs', all).then(idbOk => {
    if (!localOk && !idbOk && !takeoffQuotaWarned && typeof window !== 'undefined') {
      takeoffQuotaWarned = true
      window.alert('This takeoff is too large to save in this browser, even the backup store. Recent changes are only in memory and may be lost on reload — try a smaller or lower-resolution plan image.')
    }
  })
  return stamped
}

export function loadTakeoff(estimateId: string): TakeoffData | null {
  return loadAllTakeoffs().find(t => t.estimateId === estimateId) || null
}

/**
 * Load a takeoff preferring whichever store has the freshest copy. Big takeoffs (plan images) don't
 * fit localStorage, so their only complete copy is in IndexedDB; this is what makes such a takeoff
 * survive navigating away and back. Falls back gracefully when one store is missing/older.
 */
export async function loadTakeoffAsync(estimateId: string): Promise<TakeoffData | null> {
  const local = loadTakeoff(estimateId)
  let fromIdb: TakeoffData | null = null
  try {
    const all = (await loadKeyFromIndexedDB('fg_takeoffs')) as TakeoffData[] | null
    fromIdb = all?.find(t => t.estimateId === estimateId) ?? null
  } catch { /* IndexedDB unavailable — use localStorage */ }
  // The localStorage copy is image-stripped (see saveTakeoff); when it wins on freshness, graft
  // the plan images back in from the other copy so the editor still has its canvas background.
  const graftImages = (into: TakeoffData, from: TakeoffData | null): TakeoffData => {
    if (!from) return into
    return {
      ...into,
      plans: into.plans.map(p => {
        if (p.dataUrl) return p
        const alt = from.plans.find(q => q.id === p.id)
        return alt?.dataUrl ? { ...p, dataUrl: alt.dataUrl } : p
      }),
    }
  }
  if (local && fromIdb) {
    const lt = Date.parse(local.updatedAt || '') || 0
    const it = Date.parse(fromIdb.updatedAt || '') || 0
    return it >= lt ? graftImages(fromIdb, local) : graftImages(local, fromIdb)
  }
  if (fromIdb) return graftImages(fromIdb, local)
  return local
}

function loadAllTakeoffs(): TakeoffData[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_takeoffs') || '[]') } catch { return [] }
}

// ── Takeoff templates ────────────────────────────────────────────────────────
const BUILTIN_TAKEOFF_TEMPLATES: TakeoffTemplate[] = [
  {
    id: 'builtin-new-garden-bed',
    name: 'New Garden Bed',
    description: 'Edging, mulch, soil and plants for a planted garden bed',
    builtin: true,
    createdAt: '2026-04-09',
    items: [
      { name: 'Steel edging', unit: 'lm', wastagePercent: 5, layerName: 'Edging', layerColor: '#F59E0B' },
      { name: 'Garden mix (100mm)', unit: 'm3', wastagePercent: 10, layerName: 'Soil', layerColor: '#8B5CF6' },
      { name: 'Mulch (75mm)', unit: 'm2', wastagePercent: 10, layerName: 'Mulch', layerColor: '#84CC16' },
      { name: 'Small shrubs', unit: 'ea', wastagePercent: 0, layerName: 'Planting', layerColor: '#10B981' },
      { name: 'Feature trees', unit: 'ea', wastagePercent: 0, layerName: 'Planting', layerColor: '#10B981' },
    ],
  },
  {
    id: 'builtin-paved-area',
    name: 'Paved Area',
    description: 'Excavation, base, sand bedding, pavers and cutting allowance',
    builtin: true,
    createdAt: '2026-04-09',
    items: [
      { name: 'Excavation (150mm)', unit: 'm2', wastagePercent: 0, layerName: 'Excavation', layerColor: '#EF4444' },
      { name: 'Road base (100mm compacted)', unit: 'm2', wastagePercent: 10, layerName: 'Base', layerColor: '#F97316' },
      { name: 'Bedding sand (30mm)', unit: 'm2', wastagePercent: 10, layerName: 'Base', layerColor: '#F97316' },
      { name: 'Pavers', unit: 'm2', wastagePercent: 10, layerName: 'Pavers', layerColor: '#3B82F6' },
      { name: 'Edge restraint', unit: 'lm', wastagePercent: 5, layerName: 'Pavers', layerColor: '#3B82F6' },
    ],
  },
  {
    id: 'builtin-turfed-area',
    name: 'Turfed Area',
    description: 'Topsoil, turf, and bulk material deliveries',
    builtin: true,
    createdAt: '2026-04-09',
    items: [
      { name: 'Topsoil (100mm)', unit: 'm3', wastagePercent: 10, layerName: 'Soil', layerColor: '#8B5CF6' },
      { name: 'Turf', unit: 'm2', wastagePercent: 8, layerName: 'Turf', layerColor: '#10B981' },
      { name: 'Lawn fertiliser', unit: 'm2', wastagePercent: 0, layerName: 'Turf', layerColor: '#10B981' },
    ],
  },
]

export function loadTakeoffTemplates(): TakeoffTemplate[] {
  if (typeof window === 'undefined') return BUILTIN_TAKEOFF_TEMPLATES
  try {
    const custom = JSON.parse(localStorage.getItem('fg_takeoff_templates') || '[]') as TakeoffTemplate[]
    // Merge: built-ins first, then custom. If user has saved a custom template with
    // the same id as a built-in (shouldn't happen), the custom one wins.
    const customIds = new Set(custom.map(t => t.id))
    const merged = BUILTIN_TAKEOFF_TEMPLATES.filter(t => !customIds.has(t.id)).concat(custom)
    return merged
  } catch {
    return BUILTIN_TAKEOFF_TEMPLATES
  }
}

export function saveTakeoffTemplate(template: TakeoffTemplate): void {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem('fg_takeoff_templates')
  let custom: TakeoffTemplate[] = []
  try { custom = raw ? JSON.parse(raw) : [] } catch { custom = [] }
  const idx = custom.findIndex(t => t.id === template.id)
  if (idx >= 0) custom[idx] = template
  else custom.push(template)
  localStorage.setItem('fg_takeoff_templates', JSON.stringify(custom))
}

export function deleteTakeoffTemplate(templateId: string): void {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem('fg_takeoff_templates')
  let custom: TakeoffTemplate[] = []
  try { custom = raw ? JSON.parse(raw) : [] } catch { custom = [] }
  const filtered = custom.filter(t => t.id !== templateId)
  localStorage.setItem('fg_takeoff_templates', JSON.stringify(filtered))
}

// Generate invoice stages from an accepted design proposal
export function generateInvoiceStages(proposal: DesignProposal): ProposalInvoiceStage[] {
  const stages: ProposalInvoiceStage[] = []

  // One billing stage (or a 50/50 deposit + balance pair) per phase. Iterates the variable-length
  // phase list — getProposalPhases derives it from the legacy phase1/2/3 fields for older proposals.
  getProposalPhases(proposal).forEach((phase, i) => {
    if (!(phase.fee > 0)) return
    const ordinal = i + 1
    if (phase.depositSplit) {
      const deposit = Math.round(phase.fee * 0.5)
      const balance = phase.fee - deposit // handles odd numbers
      stages.push({
        id: `${proposal.id}-p${ordinal}-deposit`,
        name: `Phase ${ordinal} — ${phase.title} (Deposit)`,
        phase: ordinal,
        percentage: 50,
        amount: deposit,
        status: 'not_sent',
      })
      stages.push({
        id: `${proposal.id}-p${ordinal}-balance`,
        name: `Phase ${ordinal} — ${phase.title} (Balance)`,
        phase: ordinal,
        percentage: 50,
        amount: balance,
        status: 'not_sent',
      })
    } else {
      stages.push({
        id: `${proposal.id}-p${ordinal}`,
        name: `Phase ${ordinal} — ${phase.title}`,
        phase: ordinal,
        percentage: 100,
        amount: phase.fee,
        status: 'not_sent',
      })
    }
  })

  return stages
}

// Generate revenue entries from an accepted design proposal
export function generateRevenueFromProposal(proposal: DesignProposal): void {
  if (typeof window === 'undefined') return
  if (proposal.status !== 'accepted' || !proposal.acceptedAt) return

  // Remove any existing revenue entries for this proposal
  const existing = loadWeeklyRevenue()
  const filtered = existing.filter(r => !r.projectId.startsWith(`design-${proposal.id}`))

  const acceptedDate = new Date(proposal.acceptedAt)
  const entries: WeeklyRevenue[] = []

  // Helper to get next Friday from a date (never returns same day if already Friday)
  const nextFriday = (d: Date): Date => {
    const result = new Date(d)
    const day = result.getDay()
    const daysUntilFriday = day <= 5 ? 5 - day : 7 - day + 5
    result.setDate(result.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday))
    return result
  }

  // Walk the phases in order, laying each onto the forecast at a running offset. A deposit-split
  // phase bills 50% on its week + 50% six weeks later and consumes a 12-week slot; a single-stage
  // phase bills 100% and consumes a 6-week slot. Zero-fee phases consume their slot but add no
  // entry. This reproduces the original phase-1-deposit / phase-2 +12wk / phase-3 +18wk timing and
  // extends to any number of phases. (getProposalPhases derives the list for legacy proposals.)
  let dayOffset = 0
  let weekNumber = 0
  const entryAt = (offsetDays: number, suffix: string, amount: number, isDeposit: boolean, note: string) => {
    const d = new Date(acceptedDate)
    d.setDate(d.getDate() + offsetDays)
    weekNumber += 1
    entries.push({
      id: `design-${proposal.id}-${suffix}`,
      projectId: `design-${proposal.id}`,
      projectName: proposal.clientName,
      entity: 'design',
      weekEnding: nextFriday(d).toISOString().split('T')[0],
      weekNumber,
      plannedRevenue: amount,
      actualInvoiced: 0,
      isDeposit,
      notes: note,
    })
  }

  getProposalPhases(proposal).forEach((phase, i) => {
    const ordinal = i + 1
    const hasFee = phase.fee > 0
    if (phase.depositSplit) {
      if (hasFee) {
        const half = phase.fee * 0.5
        entryAt(dayOffset, `p${ordinal}-deposit`, half, true, `${phase.title} deposit (50%) — ${proposal.clientName}`)
        entryAt(dayOffset + 42, `p${ordinal}-balance`, half, false, `${phase.title} balance — ${proposal.clientName}`)
      }
      dayOffset += 84
    } else {
      if (hasFee) {
        entryAt(dayOffset, `p${ordinal}`, phase.fee, false, `${phase.title} — ${proposal.clientName}`)
      }
      dayOffset += 42
    }
  })

  const merged = [...filtered, ...entries]
  localStorage.setItem('fg_revenue', JSON.stringify(merged))
  backupToIndexedDB('fg_revenue', merged)

  // Also generate and save invoice stages if not already present
  if (!proposal.invoiceStages || proposal.invoiceStages.length === 0) {
    const stages = generateInvoiceStages(proposal)
    const withStages: DesignProposal = { ...proposal, invoiceStages: stages }
    saveProposal(withStages)
  }
}

// ── Subcontractor Packages ────────────────────────────────────────────────────

export function loadSubcontractors(projectId?: string): SubcontractorPackage[] {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem('fg_subcontractors') || '[]') as SubcontractorPackage[]
    return projectId ? all.filter(s => s.projectId === projectId) : all
  } catch { return [] }
}

export function saveSubcontractor(pkg: SubcontractorPackage): void {
  // Stamp updatedAt (carried inside the jsonb blob, which getSubcontractors reads back) so cross-device
  // newest-wins works; notify so an open subcontractors view refreshes.
  const stamped = { ...pkg, updatedAt: new Date().toISOString() }
  const all = loadSubcontractors()
  const idx = all.findIndex(s => s.id === stamped.id)
  if (idx >= 0) all[idx] = stamped; else all.push(stamped)
  localStorage.setItem('fg_subcontractors', JSON.stringify(all))
  backupToIndexedDB('fg_subcontractors', all)
  notify({ key: 'subcontractors' })
}

export function deleteSubcontractor(id: string): void {
  const all = loadSubcontractors().filter(s => s.id !== id)
  localStorage.setItem('fg_subcontractors', JSON.stringify(all))
  backupToIndexedDB('fg_subcontractors', all)
  notify({ key: 'subcontractors' })
}

// Supervisors (site supervisors / foremen with a Master-Programme colour)
export function loadSupervisors(): Supervisor[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_supervisors') || '[]') } catch { return [] }
}

export function saveSupervisor(sup: Supervisor): void {
  const stamped = { ...sup, updatedAt: new Date().toISOString() }   // stamp -> cross-device newest-wins
  const all = loadSupervisors()
  const idx = all.findIndex(s => s.id === stamped.id)
  if (idx >= 0) all[idx] = stamped; else all.push(stamped)
  localStorage.setItem('fg_supervisors', JSON.stringify(all))
  backupToIndexedDB('fg_supervisors', all)
  notify({ key: 'supervisors' })
}

export function deleteSupervisor(id: string): void {
  const all = loadSupervisors().filter(s => s.id !== id)
  localStorage.setItem('fg_supervisors', JSON.stringify(all))
  backupToIndexedDB('fg_supervisors', all)
  notify({ key: 'supervisors' })
}
// ── Estimate templates (reusable starting points for new estimates) ───────────
export function loadEstimateTemplates(): EstimateTemplate[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_estimate_templates') || '[]') } catch { return [] }
}

export function saveEstimateTemplate(template: EstimateTemplate): EstimateTemplate {
  // Stamp updatedAt on every save — drives cross-device newest-wins (see liveSync).
  const stamped = { ...template, updatedAt: new Date().toISOString() }
  const all = loadEstimateTemplates()
  const idx = all.findIndex(t => t.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  // Quota-safe: a throw here must NOT abort the caller's Supabase write (upsertEstimateTemplate
  // saves locally then pushes to the cloud - a full store once stranded a template local-only).
  try { localStorage.setItem('fg_estimate_templates', JSON.stringify(all)) }
  catch (e) { console.warn('saveEstimateTemplate: local persist failed (quota?) — cloud + IndexedDB still save', e) }
  backupToIndexedDB('fg_estimate_templates', all)
  notify({ key: 'estimate_templates' })
  return stamped
}

export function deleteEstimateTemplate(id: string): void {
  const all = loadEstimateTemplates().filter(t => t.id !== id)
  localStorage.setItem('fg_estimate_templates', JSON.stringify(all))
  backupToIndexedDB('fg_estimate_templates', all)
  notify({ key: 'estimate_templates' })
}

// ── OPC scope snippets (reusable Scope of Works prose for the OPC document) ───
export function loadOpcSnippets(): OpcSnippet[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_opc_snippets') || '[]') } catch { return [] }
}

export function saveOpcSnippet(snippet: OpcSnippet): OpcSnippet {
  // Stamp updatedAt on every save — drives cross-device newest-wins (see liveSync).
  const stamped = { ...snippet, updatedAt: new Date().toISOString() }
  const all = loadOpcSnippets()
  const idx = all.findIndex(s => s.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  try { localStorage.setItem('fg_opc_snippets', JSON.stringify(all)) }
  catch (e) { console.warn('saveOpcSnippet: local persist failed (quota?) — cloud + IndexedDB still save', e) }
  backupToIndexedDB('fg_opc_snippets', all)
  notify({ key: 'opc_snippets' })
  return stamped
}

export function deleteOpcSnippet(id: string): void {
  const all = loadOpcSnippets().filter(s => s.id !== id)
  localStorage.setItem('fg_opc_snippets', JSON.stringify(all))
  backupToIndexedDB('fg_opc_snippets', all)
  notify({ key: 'opc_snippets' })
}
