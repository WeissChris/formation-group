import type { Project, WeeklyRevenue, DesignProposal, Estimate, GanttEntry, WeeklyActual, ProgressPaymentStage, DesignProject, ProgressClaim, TakeoffData, TakeoffTemplate, ProposalInvoiceStage, SubcontractorPackage } from '@/types'
import { notify } from './broadcast'
import { getProposalPhases, phasesTotal } from './proposalPhases'
import { generateId } from './utils'

// IndexedDB backup - runs after every localStorage write. Resolves true once the write is durably
// committed (tx.oncomplete), false on any failure — so callers handling data too large for
// localStorage (e.g. takeoffs with plan images) can tell whether the durable copy actually landed.
function backupToIndexedDB(key: string, data: unknown[]): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    try {
      const dbRequest = indexedDB.open('FormationGroupBackup', 1)
      dbRequest.onupgradeneeded = () => {
        const db = dbRequest.result
        if (!db.objectStoreNames.contains('backup')) {
          db.createObjectStore('backup')
        }
      }
      dbRequest.onsuccess = () => {
        try {
          const db = dbRequest.result
          const tx = db.transaction('backup', 'readwrite')
          tx.objectStore('backup').put({ data, timestamp: new Date().toISOString() }, key)
          tx.oncomplete = () => resolve(true)
          tx.onerror = () => resolve(false)
          tx.onabort = () => resolve(false)
        } catch (e) { console.warn('[Formation] IndexedDB backup failed:', e); resolve(false) }
      }
      dbRequest.onerror = () => resolve(false)
    } catch (e) { console.warn('[Formation] IndexedDB backup failed:', e); resolve(false) }
  })
}

// Read one backup key straight from IndexedDB. Used for datasets that can exceed the ~5MB
// localStorage quota (takeoffs with plan images), where IndexedDB is the real durable store.
function loadKeyFromIndexedDB(key: string): Promise<unknown[] | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const dbRequest = indexedDB.open('FormationGroupBackup', 1)
      dbRequest.onupgradeneeded = () => {
        const db = dbRequest.result
        if (!db.objectStoreNames.contains('backup')) db.createObjectStore('backup')
      }
      dbRequest.onsuccess = () => {
        const db = dbRequest.result
        if (!db.objectStoreNames.contains('backup')) { resolve(null); return }
        const tx = db.transaction('backup', 'readonly')
        const req = tx.objectStore('backup').get(key)
        req.onsuccess = () => resolve((req.result?.data as unknown[]) ?? null)
        req.onerror = () => resolve(null)
      }
      dbRequest.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

// Recovery from IndexedDB when localStorage is empty
export async function recoverFromIndexedDB(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  return new Promise((resolve) => {
    try {
      const dbRequest = indexedDB.open('FormationGroupBackup', 1)
      dbRequest.onsuccess = () => {
        const db = dbRequest.result
        if (!db.objectStoreNames.contains('backup')) { resolve(false); return }
        const tx = db.transaction('backup', 'readonly')
        const store = tx.objectStore('backup')
        const keys = ['fg_projects', 'fg_proposals', 'fg_estimates', 'fg_revenue', 'fg_gantt', 'fg_actuals', 'fg_payment_stages', 'fg_design_projects']
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
      }
      dbRequest.onerror = () => resolve(false)
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
  localStorage.setItem('fg_projects', JSON.stringify(all))
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
    // QuotaExceededError — most likely an attached subbie-quote PDF pushed the estimates store over the
    // localStorage limit. Warn once so the user knows this save didn't stick (rather than losing it silently).
    if (typeof window !== 'undefined' && !sessionStorage.getItem('fg_estimates_quota_warned')) {
      try { sessionStorage.setItem('fg_estimates_quota_warned', '1') } catch { /* ignore */ }
      try { window.alert('This estimate is too large to save in the browser — most likely from attached quote files. Remove a large attachment and try again.') } catch { /* ignore */ }
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
  const all = loadWeeklyActuals()
  const idx = all.findIndex(a => a.id === actual.id)
  if (idx >= 0) all[idx] = actual
  else all.push(actual)
  localStorage.setItem('fg_actuals', JSON.stringify(all))
  backupToIndexedDB('fg_actuals', loadWeeklyActuals())
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
  const all = loadProgressPaymentStages()
  const idx = all.findIndex(s => s.id === stage.id)
  if (idx >= 0) all[idx] = stage
  else all.push(stage)
  localStorage.setItem('fg_payment_stages', JSON.stringify(all))
  backupToIndexedDB('fg_payment_stages', loadProgressPaymentStages())
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
}

export function deleteProgressPaymentStagesByProject(projectId: string): void {
  const all = loadProgressPaymentStages().filter(s => s.projectId !== projectId)
  localStorage.setItem('fg_payment_stages', JSON.stringify(all))
  backupToIndexedDB('fg_payment_stages', all)
}

// Design Projects
export function saveDesignProject(project: DesignProject): void {
  const all = loadDesignProjects()
  const idx = all.findIndex(p => p.id === project.id)
  if (idx >= 0) all[idx] = project
  else all.push(project)
  localStorage.setItem('fg_design_projects', JSON.stringify(all))
  backupToIndexedDB('fg_design_projects', loadDesignProjects())
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
  const all = loadProgressClaims()
  const idx = all.findIndex(c => c.id === claim.id)
  if (idx >= 0) all[idx] = claim
  else all.push(claim)
  localStorage.setItem('fg_progress_claims', JSON.stringify(all))
  backupToIndexedDB('fg_progress_claims', all)
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
    localStorage.setItem('fg_takeoffs', JSON.stringify(all))
  } catch (e) {
    // A big plan image blew the ~5MB quota. Swallow so the throw doesn't abort the React state
    // update; IndexedDB below is the durable store and the loader reads it back.
    localOk = false
    console.error('[takeoff] localStorage save failed (likely quota — plan image too large); relying on IndexedDB', e)
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
  if (local && fromIdb) {
    const lt = Date.parse(local.updatedAt || '') || 0
    const it = Date.parse(fromIdb.updatedAt || '') || 0
    return it >= lt ? fromIdb : local
  }
  return fromIdb ?? local
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
  const all = loadSubcontractors()
  const idx = all.findIndex(s => s.id === pkg.id)
  if (idx >= 0) all[idx] = pkg; else all.push(pkg)
  localStorage.setItem('fg_subcontractors', JSON.stringify(all))
  backupToIndexedDB('fg_subcontractors', all)
}

export function deleteSubcontractor(id: string): void {
  const all = loadSubcontractors().filter(s => s.id !== id)
  localStorage.setItem('fg_subcontractors', JSON.stringify(all))
  backupToIndexedDB('fg_subcontractors', all)
}