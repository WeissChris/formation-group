import type { Project, WeeklyRevenue, DesignProposal, Estimate, GanttEntry, WeeklyActual, ProgressPaymentStage, DesignProject, ProgressClaim, TakeoffData, ProposalInvoiceStage, SubcontractorPackage } from '@/types'

// IndexedDB backup - runs silently after every localStorage write
async function backupToIndexedDB(key: string, data: unknown[]): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const dbRequest = indexedDB.open('FormationGroupBackup', 1)
    dbRequest.onupgradeneeded = () => {
      const db = dbRequest.result
      if (!db.objectStoreNames.contains('backup')) {
        db.createObjectStore('backup')
      }
    }
    dbRequest.onsuccess = () => {
      const db = dbRequest.result
      const tx = db.transaction('backup', 'readwrite')
      const store = tx.objectStore('backup')
      store.put({ data, timestamp: new Date().toISOString() }, key)
    }
  } catch (e) { console.warn('[Formation] IndexedDB backup failed:', e) }
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
  const all = loadProjects()
  const idx = all.findIndex(p => p.id === project.id)
  if (idx >= 0) all[idx] = project
  else all.push(project)
  localStorage.setItem('fg_projects', JSON.stringify(all))
  backupToIndexedDB('fg_projects', loadProjects())
}

export function loadProjects(): Project[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_projects') || '[]') } catch { return [] }
}

export function deleteProject(id: string): void {
  const all = loadProjects().filter(p => p.id !== id)
  localStorage.setItem('fg_projects', JSON.stringify(all))
  backupToIndexedDB('fg_projects', all)
}

// Weekly revenue entries
export function saveWeeklyRevenue(entry: WeeklyRevenue): void {
  const all = loadWeeklyRevenue()
  const idx = all.findIndex(w => w.id === entry.id)
  if (idx >= 0) all[idx] = entry
  else all.push(entry)
  localStorage.setItem('fg_revenue', JSON.stringify(all))
  backupToIndexedDB('fg_revenue', loadWeeklyRevenue())
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
  const all = loadProposals()
  const idx = all.findIndex(p => p.id === proposal.id)
  if (idx >= 0) all[idx] = proposal
  else all.push(proposal)
  localStorage.setItem('fg_proposals', JSON.stringify(all))
  backupToIndexedDB('fg_proposals', loadProposals())
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
  const all = loadEstimates()
  const idx = all.findIndex(e => e.id === estimate.id)
  if (idx >= 0) all[idx] = estimate
  else all.push(estimate)
  localStorage.setItem('fg_estimates', JSON.stringify(all))
  backupToIndexedDB('fg_estimates', loadEstimates())
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

// Delete all WeeklyRevenue entries for a project (for Gantt forecast regeneration)
export function deleteWeeklyRevenueByProject(projectId: string): void {
  const all = loadWeeklyRevenue().filter(w => w.projectId !== projectId)
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
export function saveTakeoff(data: TakeoffData): void {
  const all = loadAllTakeoffs()
  const idx = all.findIndex(t => t.estimateId === data.estimateId)
  if (idx >= 0) all[idx] = data
  else all.push(data)
  localStorage.setItem('fg_takeoffs', JSON.stringify(all))
  backupToIndexedDB('fg_takeoffs', all)
}

export function loadTakeoff(estimateId: string): TakeoffData | null {
  return loadAllTakeoffs().find(t => t.estimateId === estimateId) || null
}

function loadAllTakeoffs(): TakeoffData[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_takeoffs') || '[]') } catch { return [] }
}

// Generate invoice stages from an accepted design proposal
export function generateInvoiceStages(proposal: DesignProposal): ProposalInvoiceStage[] {
  const stages: ProposalInvoiceStage[] = []

  // Phase 1: 50% deposit + 50% balance
  if (proposal.phase1Fee > 0) {
    const deposit = Math.round(proposal.phase1Fee * 0.5)
    const balance = proposal.phase1Fee - deposit // handles odd numbers
    stages.push({
      id: `${proposal.id}-p1-deposit`,
      name: 'Phase 1 — Concept Design (Deposit)',
      phase: 1,
      percentage: 50,
      amount: deposit,
      status: 'not_sent',
    })
    stages.push({
      id: `${proposal.id}-p1-balance`,
      name: 'Phase 1 — Concept Design (Balance)',
      phase: 1,
      percentage: 50,
      amount: balance,
      status: 'not_sent',
    })
  }

  // Phase 2: 100%
  if (proposal.phase2Fee > 0) {
    stages.push({
      id: `${proposal.id}-p2`,
      name: 'Phase 2 — Design Development',
      phase: 2,
      percentage: 100,
      amount: proposal.phase2Fee,
      status: 'not_sent',
    })
  }

  // Phase 3: 100% — only if exists
  if (proposal.phase3Fee && proposal.phase3Fee > 0) {
    stages.push({
      id: `${proposal.id}-p3`,
      name: 'Phase 3 — Administration',
      phase: 3,
      percentage: 100,
      amount: proposal.phase3Fee,
      status: 'not_sent',
    })
  }

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

  // Phase 1: 50% deposit on acceptance week, 50% balance ~6 weeks later
  if (proposal.phase1Fee > 0) {
    const depositWeek = nextFriday(acceptedDate)
    const depositAmount = proposal.phase1Fee * 0.5
    entries.push({
      id: `design-${proposal.id}-p1-deposit`,
      projectId: `design-${proposal.id}`,
      projectName: proposal.clientName,
      entity: 'design',
      weekEnding: depositWeek.toISOString().split('T')[0],
      weekNumber: 1,
      plannedRevenue: depositAmount,
      actualInvoiced: 0,
      isDeposit: true,
      notes: `Phase 1 deposit (50%) — ${proposal.clientName}`,
    })

    // Phase 1 balance: 6 weeks after acceptance
    const phase1BalanceDate = new Date(acceptedDate)
    phase1BalanceDate.setDate(phase1BalanceDate.getDate() + 42)
    const phase1BalanceWeek = nextFriday(phase1BalanceDate)
    entries.push({
      id: `design-${proposal.id}-p1-balance`,
      projectId: `design-${proposal.id}`,
      projectName: proposal.clientName,
      entity: 'design',
      weekEnding: phase1BalanceWeek.toISOString().split('T')[0],
      weekNumber: 2,
      plannedRevenue: depositAmount,
      actualInvoiced: 0,
      isDeposit: false,
      notes: `Phase 1 balance — ${proposal.clientName}`,
    })
  }

  // Phase 2: 100% on completion, ~12 weeks after acceptance
  if (proposal.phase2Fee > 0) {
    const phase2Date = new Date(acceptedDate)
    phase2Date.setDate(phase2Date.getDate() + 84)
    const phase2Week = nextFriday(phase2Date)
    entries.push({
      id: `design-${proposal.id}-p2`,
      projectId: `design-${proposal.id}`,
      projectName: proposal.clientName,
      entity: 'design',
      weekEnding: phase2Week.toISOString().split('T')[0],
      weekNumber: 3,
      plannedRevenue: proposal.phase2Fee,
      actualInvoiced: 0,
      isDeposit: false,
      notes: `Phase 2 — ${proposal.clientName}`,
    })
  }

  // Phase 3: 100% on completion, ~18 weeks after acceptance
  if (proposal.phase3Fee && proposal.phase3Fee > 0) {
    const phase3Date = new Date(acceptedDate)
    phase3Date.setDate(phase3Date.getDate() + 126) // 18 weeks
    const phase3Week = nextFriday(phase3Date)
    entries.push({
      id: `design-${proposal.id}-p3`,
      projectId: `design-${proposal.id}`,
      projectName: proposal.clientName,
      entity: 'design',
      weekEnding: phase3Week.toISOString().split('T')[0],
      weekNumber: 4,
      plannedRevenue: proposal.phase3Fee,
      actualInvoiced: 0,
      isDeposit: false,
      notes: `Phase 3 — ${proposal.clientName}`,
    })
  }

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