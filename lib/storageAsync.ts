import { supabase, isSupabaseConfigured } from './supabase'
import { notify } from './broadcast'
import {
  loadProposals,
  saveProposal,
  generateRevenueFromProposal,
  loadDesignProjectByProposalId,
  buildDesignProjectFromProposal,
  loadProjects,
  saveProject,
  deleteProject,
  deleteProposal,
  loadEstimates,
  saveEstimate,
  deleteEstimate,
  loadWeeklyRevenue,
  saveWeeklyRevenue,
  deleteWeeklyRevenue,
  saveGanttEntries,
  loadDesignProjects,
  saveDesignProject,
  loadProgressPaymentStages,
  saveProgressPaymentStage,
  deleteProgressPaymentStage,
  loadWeeklyActuals,
  saveWeeklyActual,
  loadSubcontractors,
  saveSubcontractor,
  deleteSubcontractor,
  loadProgressClaims,
  saveProgressClaim,
  deleteProgressClaim,
  loadSupervisors,
  saveSupervisor,
  deleteSupervisor,
  loadEstimateTemplates,
  saveEstimateTemplate,
  deleteEstimateTemplate,
  loadOpcSnippets,
  saveOpcSnippet,
  deleteOpcSnippet,
} from './storage'
import { loadCustomLibrary, saveCustomLibraryItem, deleteCustomLibraryItem } from './itemLibrary'
import type {
  DesignProposal,
  Project,
  Estimate,
  WeeklyRevenue,
  GanttEntry,
  DesignProject,
  ProgressPaymentStage,
  WeeklyActual,
  TakeoffData,
  SubcontractorPackage,
  ProgressClaim,
  Supervisor,
  LibraryItem,
  EstimateTemplate,
  OpcSnippet,
} from '@/types'

// Gantt milestones are defined structurally in the gantt/programme pages (not in @/types). The sync
// layer only needs id/projectId/label/date so it can store + restore the array verbatim — declare a
// minimal shape here rather than coupling to either page's local interface.
export interface Milestone {
  id: string
  projectId: string
  label: string
  date: string
  colour?: string
}

/**
 * Conflict-aware upsert primitive. Reads `updated_at` for the row currently in Supabase, and
 * skips the write if the remote is newer than the local `updatedAt` we're trying to push.
 *
 * Real-world failure mode this prevents:
 *   - Edit on device A → upsert (succeeds, sets remote.updated_at = T1)
 *   - Open device B before its auto-sync pulls
 *   - Edit on device B (its local copy doesn't have the A edit)
 *   - Device B upserts → would silently overwrite the A edit
 *
 * With this guard, device B's upsert is refused because remote.updated_at (T1, from A) is
 * newer than B's local.updatedAt (T0, before the auto-sync). B should pull then re-edit.
 *
 * Returns { wrote: boolean, skippedReason?: string } so the caller can log/surface.
 *
 * Note: this is best-effort optimistic concurrency, not transactional. Two clients writing in
 * the same millisecond can still race. For our single-user-but-multi-device pattern that's fine.
 */
async function safeUpsert<T extends Record<string, unknown> & { id: string; updated_at?: string }>(
  table: string,
  row: T,
): Promise<{ wrote: boolean; skippedReason?: string }> {
  if (!supabase) return { wrote: false, skippedReason: 'no_supabase' }
  // Read remote stamp first
  const { data: remote } = await supabase
    .from(table)
    .select('updated_at')
    .eq('id', row.id)
    .maybeSingle()

  const remoteStamp = remote?.updated_at as string | undefined
  const localStamp = row.updated_at

  if (remoteStamp && localStamp) {
    // Compare as dates, not raw strings. Supabase serialises timestamps as "2026-06-12 07:32:35+00"
    // while the app writes ISO "2026-06-12T07:32:35Z"; a string compare ranks the space-form below the
    // T-form regardless of actual time, which let stale local copies clobber newer remote rows. Parse
    // both and only fall back to a string compare if either is unparseable.
    const rt = Date.parse(remoteStamp)
    const lt = Date.parse(localStamp as string)
    const remoteNewer = Number.isFinite(rt) && Number.isFinite(lt) ? rt > lt : remoteStamp > localStamp
    if (remoteNewer) {
      // Remote is strictly newer — don't clobber. Caller should pull and merge before retrying.
      return { wrote: false, skippedReason: 'remote_newer' }
    }
  }

  const { error } = await supabase.from(table).upsert(row)
  if (error) return { wrote: false, skippedReason: error.message }
  return { wrote: true }
}

/**
 * Pick what to push to Supabase: the freshly-saved localStorage copy, or the caller's in-memory
 * copy. The re-read exists to pick up the save helper's new updatedAt stamp — but when
 * localStorage is over quota that save FAILS silently and the re-read returns a STALE row.
 * Pushing that would freeze the cloud copy too, so edits persist nowhere and die with the tab
 * (days of estimate line-item work were lost exactly this way). The re-read only wins when its
 * stamp is at least as fresh as the caller's copy; otherwise the in-memory copy is the truth.
 */
function newestOf<T extends { updatedAt?: string }>(passed: T, reread: T | undefined): T {
  if (!reread) return passed
  const r = Date.parse(reread.updatedAt || '') || 0
  const p = Date.parse(passed.updatedAt || '') || 0
  return r >= p ? reread : passed
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_projects').select('*').order('created_at', { ascending: false })
    if (data) return data.map(mapProject)
  }
  return loadProjects()
}

export async function upsertProject(project: Project): Promise<void> {
  saveProject(project) // always save to localStorage (this also stamps updatedAt)
  if (isSupabaseConfigured() && supabase) {
    // Re-read for the freshly-stamped updatedAt — unless the save failed and the re-read is stale.
    const fresh = newestOf(project, loadProjects().find(p => p.id === project.id))
    await safeUpsert('fg_projects', {
      id: fresh.id,
      entity: fresh.entity,
      name: fresh.name,
      address: fresh.address,
      client_name: fresh.clientName,
      client_phone: fresh.clientPhone ?? null,
      client_email: fresh.clientEmail ?? null,
      site_access_notes: fresh.siteAccessNotes ?? null,
      status: fresh.status,
      contract_value: fresh.contractValue,
      start_date: fresh.startDate,
      planned_completion: fresh.plannedCompletion,
      foreman: fresh.foreman,
      notes: fresh.notes,
      stage: fresh.stage || null,
      stage_checklist: fresh.stageChecklist || null,
      next_action: fresh.nextAction || null,
      invoice_model: fresh.invoiceModel || null,
      target_margin_pct: fresh.targetMarginPct ?? null,
      project_type: fresh.projectType ?? null,
      scopes: fresh.scopes ?? null,
      baseline: fresh.baseline ?? null,
      forecast_completion: fresh.forecastCompletion ?? null,
      forecast_cost: fresh.forecastCost ?? null,
      crew_size: fresh.crewSize ?? null,
      // Only push the foreman PIN when we actually have one — never null out an existing PIN in the
      // DB. It's used by the foreman portal, not edited in the office UI, so the office copy can lack
      // it; a blanket `foreman_pin: null` would lock foremen out.
      ...(fresh.foremanPin ? { foreman_pin: fresh.foremanPin } : {}),
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

/**
 * Delete a project from localStorage AND Supabase. The plain localStorage delete leaves the row in
 * Supabase, which the add-missing sync would then resurrect on the next load — so the delete must
 * reach the DB too.
 */
export async function deleteProjectAsync(id: string): Promise<void> {
  deleteProject(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_projects').delete().eq('id', id)
    if (error) console.error('[Formation] project delete (Supabase) error:', error.message)
  }
}

// ── PROPOSALS ────────────────────────────────────────────────────────────────

export async function getProposals(): Promise<DesignProposal[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_proposals').select('*').order('created_at', { ascending: false })
    if (data) return data.map(mapProposal)
  }
  return loadProposals()
}

export async function upsertProposal(proposal: DesignProposal): Promise<void> {
  saveProposal(proposal)
  if (isSupabaseConfigured() && supabase) {
    let fresh = newestOf(proposal, loadProposals().find(p => p.id === proposal.id))
    // Guard against wiping a client's acceptance. Acceptance is recorded straight to Supabase from the
    // client's browser (the public proposal page), so the office copy can still say "sent". Pushing
    // that stale copy would overwrite the acceptance back to "sent". If Supabase already has this
    // proposal accepted and our copy doesn't, pull the acceptance down first — heals localStorage and
    // makes the push reflect the acceptance instead of downgrading it.
    if (fresh.status !== 'accepted') {
      const { data: remote } = await supabase
        .from('fg_proposals')
        .select('status, accepted_at, accepted_by_name')
        .eq('id', fresh.id)
        .maybeSingle()
      if (remote && (remote.status === 'accepted' || remote.accepted_at)) {
        fresh = {
          ...fresh,
          status: 'accepted',
          acceptedAt: (remote.accepted_at as string) ?? fresh.acceptedAt,
          acceptedByName: (remote.accepted_by_name as string) ?? fresh.acceptedByName,
        }
        saveProposal(fresh)
      }
    }
    await safeUpsert('fg_proposals', {
      id: fresh.id,
      client_name: fresh.clientName,
      client_name2: fresh.clientName2 ?? null,
      care_of: fresh.careOf ?? null,
      client_email: fresh.clientEmail,
      client_phone: fresh.clientPhone,
      project_address: fresh.projectAddress,
      status: fresh.status,
      phase1_fee: fresh.phase1Fee,
      phase1_scope: fresh.phase1Scope,
      phase2_fee: fresh.phase2Fee,
      phase2_scope: fresh.phase2Scope,
      phase3_fee: fresh.phase3Fee,
      phase3_scope: fresh.phase3Scope,
      phases: fresh.phases ?? [],
      intro_text: fresh.introText,
      email_message: fresh.emailMessage,
      program_text: fresh.programText ?? null,
      cc_emails: fresh.ccEmails,
      welcome_video_url: fresh.welcomeVideoUrl ?? null,
      process_video_url: fresh.processVideoUrl ?? null,
      valid_until: fresh.validUntil,
      notes: fresh.notes,
      acceptance_token: fresh.acceptanceToken,
      accepted_at: fresh.acceptedAt,
      accepted_by_name: fresh.acceptedByName,
      content_blocks: fresh.contentBlocks || [],
      potential_build_value: fresh.potentialBuildValue ?? null,
      expected_construction: fresh.expectedConstruction ?? null,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

/**
 * Delete a proposal from localStorage AND Supabase. The plain localStorage delete leaves the row in
 * Supabase, which the add-missing reconcile would then resurrect on the next load — so the delete
 * must reach the DB too.
 */
export async function deleteProposalAsync(id: string): Promise<void> {
  deleteProposal(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_proposals').delete().eq('id', id)
    if (error) console.error('[Formation] proposal delete (Supabase) error:', error.message)
  }
}

/**
 * Pull client proposal acceptances down from Supabase into localStorage. The client accepts on the
 * public proposal page (straight to Supabase via accept_proposal_by_token); the office reads
 * localStorage, so without this a 'sent' proposal never flips to 'accepted' until the next login.
 * The login hydrate already does this, but only at login — a device with a persisted session never
 * re-runs it, so the office list keeps showing "Sent". Call it when showing the design list/detail.
 * Mirrors reconcileVariations: restore-if-empty, otherwise lift a local 'sent' to the recorded
 * acceptance. Returns how many local proposals changed.
 */
export async function reconcileProposals(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0
  const remote = await getProposals()
  const local = loadProposals()
  let changed = 0
  if (local.length === 0 && remote.length > 0) {
    // Fresh / cleared device: restore all remote proposals locally.
    remote.forEach(p => saveProposal(p))
    changed = remote.length
  } else {
    const byId = new Map(remote.map(p => [p.id, p]))
    for (const lp of local) {
      const r = byId.get(lp.id)
      if (!r) continue
      let next = lp
      // Lift a client acceptance recorded on the public page.
      if (r.status === 'accepted' && lp.status !== 'accepted') {
        next = { ...next, status: 'accepted', acceptedAt: r.acceptedAt ?? next.acceptedAt, acceptedByName: r.acceptedByName ?? next.acceptedByName }
      }
      // Lift the first-viewed timestamp the public page recorded when the client opened it.
      if (r.firstViewedAt && !next.firstViewedAt) {
        next = { ...next, firstViewedAt: r.firstViewedAt }
      }
      if (next !== lp) { saveProposal(next); changed++ }
    }
    // Add-missing: pull any proposal that exists remotely but not in this browser (e.g. created on
    // another device). Restore-if-empty above only rescues a fully-wiped device; without this a
    // device that already has proposals never receives new ones created elsewhere.
    const localIds = new Set(local.map(p => p.id))
    for (const r of remote) {
      if (!localIds.has(r.id)) { saveProposal(r); changed++ }
    }
  }
  // Ensure each accepted proposal's downstream bookkeeping (revenue forecast + design-delivery
  // tracker) exists office-side. A client accepts on the public page, which runs this generation in
  // the CLIENT's browser, so it never reaches the office — generate it here on load instead.
  const accepted = loadProposals().filter(p => p.status === 'accepted' && p.acceptedAt)
  if (accepted.length > 0) {
    // Skip any proposal that already has a design project locally OR in Supabase, so a second device
    // (which lacks the local copy) can't generate a duplicate with a fresh random id.
    const remoteDPs = await getDesignProjects()
    const haveDesignProject = new Set<string>([
      ...loadDesignProjects().map(d => d.proposalId),
      ...remoteDPs.map(d => d.proposalId),
    ])
    for (const p of accepted) {
      if (haveDesignProject.has(p.id)) continue
      try { await processProposalAcceptance(p) } catch (e) { console.warn('[accept] bookkeeping failed', e) }
    }
  }
  return changed
}

/**
 * Office-side flow-through for an accepted proposal: generate the revenue forecast + the
 * design-delivery tracker row, then push both to Supabase. Idempotent — the design project is the
 * "already processed" marker, so this runs once per acceptance and is a no-op afterwards. This is the
 * piece the client's browser can't do for the office (their generation lands in their own
 * localStorage); calling it from the office reconcile/load path completes the chain.
 * Returns true when it generated the bookkeeping.
 */
export async function processProposalAcceptance(proposal: DesignProposal): Promise<boolean> {
  if (proposal.status !== 'accepted' || !proposal.acceptedAt) return false
  if (loadDesignProjectByProposalId(proposal.id)) return false // already processed office-side
  // 1. Revenue forecast (localStorage; idempotent — replaces any prior rows for this proposal)
  generateRevenueFromProposal(proposal)
  // 2. Design-delivery tracker row
  const dp = buildDesignProjectFromProposal(proposal)
  saveDesignProject(dp)
  // 3. Push the freshly generated data up to Supabase (durable + visible on other devices)
  try {
    await upsertDesignProject(dp)
    const rows = loadWeeklyRevenue().filter(r => r.projectId === `design-${proposal.id}`)
    for (const r of rows) await upsertRevenue(r)
  } catch (e) {
    console.warn('[accept] supabase push failed (kept locally)', e)
  }
  return true
}

// ── ESTIMATES ────────────────────────────────────────────────────────────────

export async function getEstimates(): Promise<Estimate[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_estimates').select('*').order('created_at', { ascending: false })
    if (data) return data.map(mapEstimate)
  }
  return loadEstimates()
}

/**
 * Delete an estimate from localStorage AND Supabase. The plain localStorage delete leaves the row in
 * Supabase, which the add-missing sync would then resurrect on the next load — so the delete must
 * reach the DB too.
 */
export async function deleteEstimateAsync(id: string): Promise<void> {
  deleteEstimate(id) // localStorage + IndexedDB (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_estimates').delete().eq('id', id)
    if (error) console.error('[Formation] estimate delete (Supabase) error:', error.message)
    // Orphan cleanup: an estimate's takeoff (keyed by estimate_id) would otherwise be left behind in
    // fg_takeoffs with no estimate to attach to — drop it in the same delete.
    const { error: tErr } = await supabase.from('fg_takeoffs').delete().eq('estimate_id', id)
    if (tErr) console.error('[Formation] takeoff orphan delete (Supabase) error:', tErr.message)
  }
}

export async function upsertEstimate(estimate: Estimate): Promise<void> {
  saveEstimate(estimate)
  if (isSupabaseConfigured() && supabase) {
    let fresh = newestOf(estimate, loadEstimates().find(e => e.id === estimate.id))
    // Don't downgrade a variation the client already responded to. Approval/rejection is written
    // straight to Supabase from the public page; if our local copy is still 'sent', pull the client's
    // response down first so this push can't clobber it. (Only 'sent' variations can be responded to.)
    if (fresh.parentEstimateId && fresh.status === 'sent') {
      const { data: remote } = await supabase
        .from('fg_estimates')
        .select('status, accepted_at, accepted_by_name, archived, declined_at, declined_by_name')
        .eq('id', fresh.id)
        .maybeSingle()
      if (remote && remote.status === 'accepted') {
        fresh = { ...fresh, status: 'accepted', acceptedAt: (remote.accepted_at as string) ?? fresh.acceptedAt, acceptedByName: (remote.accepted_by_name as string) ?? fresh.acceptedByName, archived: false }
        saveEstimate(fresh)
      } else if (remote && remote.archived) {
        fresh = { ...fresh, status: (remote.status as Estimate['status']) || 'declined', archived: true, declinedAt: (remote.declined_at as string) ?? fresh.declinedAt, declinedByName: (remote.declined_by_name as string) ?? fresh.declinedByName }
        saveEstimate(fresh)
      }
    }
    await safeUpsert('fg_estimates', {
      id: fresh.id,
      project_id: fresh.projectId || null,   // '' would violate the FK to fg_projects
      project_name: fresh.projectName,
      client_name: fresh.clientName ?? null,
      project_address: fresh.projectAddress ?? null,
      name: fresh.name,
      version: fresh.version,
      status: fresh.status,
      default_markup_formation: fresh.defaultMarkupFormation,
      default_markup_subcontractor: fresh.defaultMarkupSubcontractor,
      line_items: fresh.lineItems,
      category_notes: fresh.categoryNotes || {},
      parent_estimate_id: fresh.parentEstimateId,
      variation_number: fresh.variationNumber,
      variation_reason: fresh.variationReason,
      variation_amount: fresh.variationAmount ?? null,
      project_markups: fresh.projectMarkups ?? [],
      rounding_mode: fresh.roundingMode ?? null,
      project_type: fresh.projectType ?? null,
      proposal_id: fresh.proposalId ?? null,
      is_baseline: fresh.isBaseline ?? false,
      sent_at: fresh.sentAt ?? null,
      accepted_at: fresh.acceptedAt ?? null,
      acceptance_token: fresh.acceptanceToken ?? null,
      send_message: fresh.sendMessage ?? null,
      accepted_by_name: fresh.acceptedByName ?? null,
      declined_at: fresh.declinedAt ?? null,
      declined_by_name: fresh.declinedByName ?? null,
      archived: fresh.archived ?? false,
      opc: fresh.opc ?? null,
      notes: fresh.notes,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

/**
 * Pull client variation responses down from Supabase into localStorage. The client approves/rejects on
 * the public /variation page (straight to Supabase); the office reads localStorage, so without this a
 * 'sent' variation never flips to accepted/archived until the next login. Call it when showing a
 * project or the estimates list. Returns how many local variations changed.
 */
export async function reconcileVariations(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0
  const remote = await getEstimates()
  const byId = new Map(remote.map(e => [e.id, e]))
  let changed = 0
  for (const local of loadEstimates()) {
    if (!local.parentEstimateId) continue
    const r = byId.get(local.id)
    if (!r) continue
    if (r.status === 'accepted' && local.status !== 'accepted') {
      saveEstimate({ ...local, status: 'accepted', acceptedAt: r.acceptedAt ?? local.acceptedAt, acceptedByName: r.acceptedByName ?? local.acceptedByName, archived: false })
      changed++
    } else if (r.archived && !local.archived) {
      saveEstimate({ ...local, status: r.status, archived: true, declinedAt: r.declinedAt, declinedByName: r.declinedByName })
      changed++
    }
  }
  return changed
}

// ── REVENUE ──────────────────────────────────────────────────────────────────

export async function getRevenue(): Promise<WeeklyRevenue[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_revenue').select('*')
    if (data) return data.map(mapRevenue)
  }
  return loadWeeklyRevenue()
}

export async function upsertRevenue(entry: WeeklyRevenue): Promise<void> {
  saveWeeklyRevenue(entry)
  if (isSupabaseConfigured() && supabase) {
    const fresh = loadWeeklyRevenue().find(r => r.id === entry.id) ?? entry
    await safeUpsert('fg_revenue', {
      id: fresh.id,
      project_id: fresh.projectId,
      project_name: fresh.projectName,
      entity: fresh.entity,
      week_ending: fresh.weekEnding,
      week_number: fresh.weekNumber,
      planned_revenue: fresh.plannedRevenue,
      actual_invoiced: fresh.actualInvoiced,
      scheduled_cost: fresh.scheduledCost ?? null,   // the Gantt-derived weekly cost model
      is_deposit: fresh.isDeposit,
      notes: fresh.notes,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

/**
 * Delete a weekly-revenue row from localStorage AND Supabase. The plain localStorage delete leaves
 * the row in Supabase, which the add-missing sync would then resurrect on the next load — so the
 * delete must reach the DB too.
 */
export async function deleteWeeklyRevenueAsync(id: string): Promise<void> {
  deleteWeeklyRevenue(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_revenue').delete().eq('id', id)
    if (error) console.error('[Formation] revenue delete (Supabase) error:', error.message)
  }
}

// ── GANTT ────────────────────────────────────────────────────────────────────

/**
 * Persist a project's Gantt entries to localStorage AND Supabase, and announce a 'gantt' change so
 * other tabs/devices live-refresh (newest-wins via liveSync). Every entry is stamped with one shared
 * `updatedAt` so the local cache and the DB row agree (a saver won't see its own realtime echo as
 * "newer"). Uses upsert-on-id + prune (NOT delete-all-then-insert): per-row identity is preserved, so
 * realtime emits a DELETE only for a genuinely removed category, and there's never a window where the
 * project has zero rows (the old delete+insert could wipe the schedule if it died between the two).
 */
// ── /SITE PERSISTENCE MODE ─────────────────────────────────────────────────────
// Inside the supervisor cockpit (/site) the user has no admin Supabase write grant, so the gantt's
// three remote writes (entries, forecast revenue, milestones) POST to the session-scoped /api/site
// routes instead of hitting Supabase directly. localStorage writes are unchanged. Set by the /site
// schedule route while the gantt is mounted; null everywhere else, so the office path is untouched.
let ganttSiteProjectId: string | null = null
export function setGanttSiteMode(projectId: string | null): void { ganttSiteProjectId = projectId }
async function postSite(path: string, body: unknown): Promise<void> {
  try {
    await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch (e) { console.error('[Formation] /site write failed:', path, e) }
}

export async function upsertGanttEntries(projectId: string, entries: GanttEntry[]): Promise<void> {
  const stamp = new Date().toISOString()
  const stamped = entries.map(e => ({ ...e, updatedAt: stamp }))
  saveGanttEntries(projectId, stamped)   // localStorage (immediate)
  notify({ key: 'gantt' })               // live-refresh sibling tabs (other devices go via liveSync)
  if (ganttSiteProjectId === projectId) {
    if (stamped.length === 0) return     // same empty-clobber guard as the office path
    await postSite(`/api/site/projects/${projectId}/gantt`, { entries: stamped })
    return
  }
  if (!isSupabaseConfigured() || !supabase) return
  // EMPTY-CLOBBER GUARD: an empty set is almost always "not loaded yet" (a device that never opened
  // this project), never an intentional full clear — so don't touch the project's remote rows.
  if (stamped.length === 0) return
  const rows = stamped.map(e => ({
    id: e.id,
    project_id: projectId,
    estimate_id: e.estimateId || null,
    category: e.category,
    crew_type: e.crewType,
    budgeted_revenue: e.budgetedRevenue,
    budgeted_cost: e.budgetedCost,
    segments: e.segments ?? [],
    subtasks: e.subtasks ?? [],
    notes: e.notes ?? null,
    updated_at: stamp,
  }))
  const { error } = await supabase.from('fg_gantt').upsert(rows, { onConflict: 'id' })
  if (error) { console.error('[Formation] gantt upsert (Supabase) error:', error.message); return }
  // Prune categories removed on this device: this project's remote rows whose id is no longer present.
  const keep = new Set(stamped.map(e => e.id))
  const { data: existing } = await supabase.from('fg_gantt').select('id').eq('project_id', projectId)
  const removed = (existing ?? []).map(r => r.id as string).filter(rid => !keep.has(rid))
  if (removed.length) await supabase.from('fg_gantt').delete().in('id', removed)
}

/**
 * Replace this project's Gantt-generated revenue rows in Supabase (the localStorage side is handled
 * by the caller via deleteGanttGeneratedRevenueByProject + saveWeeklyRevenue). Deletes the prior
 * "(Gantt)"-tagged rows for the project, then inserts the fresh forecast — so regenerating a forecast
 * doesn't leave stale rows in the DB. Manual/deposit rows (not tagged) are untouched.
 */
export async function replaceGanttRevenueRemote(projectId: string, rows: WeeklyRevenue[]): Promise<void> {
  if (ganttSiteProjectId === projectId) {
    await postSite(`/api/site/projects/${projectId}/revenue`, { rows })
    return
  }
  if (!isSupabaseConfigured() || !supabase) return
  // Match the LOCAL predicate exactly (deleteGanttGeneratedRevenueByProject: trim().endsWith('(Gantt)')).
  // A bare `.like('notes', '%(Gantt)')` is end-anchored, so a Gantt row with a trailing space
  // ("Excavation (Gantt) ") gets deleted locally but survives remotely, then the add-missing sync
  // resurrects it as a duplicate forecast row. A `%(Gantt)%` like would over-match (it would also
  // catch a manual note with "(Gantt)" mid-string). Fetch the project's rows and filter with the same
  // trim/endsWith logic so the two sides can't drift in either direction.
  const { data: existing } = await supabase
    .from('fg_revenue')
    .select('id, notes')
    .eq('project_id', projectId)
  const staleIds = (existing ?? [])
    .filter(r => ((r.notes as string | null) ?? '').trim().endsWith('(Gantt)'))
    .map(r => r.id as string)
  if (staleIds.length > 0) {
    await supabase.from('fg_revenue').delete().in('id', staleIds)
  }
  if (rows.length === 0) return
  const mapped = rows.map(r => ({
    id: r.id,
    project_id: r.projectId,
    project_name: r.projectName,
    entity: r.entity,
    week_ending: r.weekEnding,
    week_number: r.weekNumber,
    planned_revenue: r.plannedRevenue,
    actual_invoiced: r.actualInvoiced,
    scheduled_cost: r.scheduledCost ?? null,
    is_deposit: r.isDeposit,
    notes: r.notes,
    updated_at: r.updatedAt ?? new Date().toISOString(),
  }))
  await supabase.from('fg_revenue').insert(mapped)
}

// ── SUBCONTRACTOR PACKAGES ────────────────────────────────────────────────────
//
// jsonb-blob pattern: the whole package lives in `data`, so there's no per-column drift to keep in
// sync. Quote files live in the 'attachments' Storage bucket (quoteFilePath); legacy rows may still
// carry an embedded quoteFileData base64 until lib/attachmentsMigrate.ts has run on their browser.

export async function getSubcontractors(): Promise<SubcontractorPackage[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_subcontractors').select('*')
    if (data) return data.map(r => r.data as SubcontractorPackage)
  }
  return []
}

// ── ITEM LIBRARY + ESTIMATE TEMPLATES (jsonb-blob pattern, cross-device via liveSync) ─────────────

export async function getLibraryItems(): Promise<LibraryItem[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_library_items').select('*')
    if (data) return data.map(r => r.data as LibraryItem)
  }
  return []
}

export async function upsertLibraryItem(item: LibraryItem): Promise<void> {
  const fresh = saveCustomLibraryItem(item) // localStorage (stamps updatedAt) + notify
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_library_items').upsert({
      id: fresh.id,
      data: fresh,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
    if (error) console.error('[Formation] library item upsert (Supabase) error:', error.message)
  }
}

export async function deleteLibraryItemAsync(id: string): Promise<void> {
  deleteCustomLibraryItem(id)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_library_items').delete().eq('id', id)
    if (error) console.error('[Formation] library item delete (Supabase) error:', error.message)
  }
}

/**
 * Push any local-only (or locally-newer) estimate templates, OPC snippets and item-library rows
 * up to Supabase. These datasets only ever pushed on an explicit save, so a save whose cloud write
 * was skipped (a full localStorage once threw before the push ran) stranded the row local-only with
 * no path back. Runs once on an authenticated load to heal that; newest-wins so it can't clobber a
 * fresher cloud copy. Pull-side sync (liveSync) already brings remote rows down.
 */
export async function pushLocalLibraryDataToCloud(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return
  const db = supabase
  const jobs: Array<{ table: string; local: { id: string; updatedAt?: string }[]; push: (row: never) => Promise<void> }> = [
    { table: 'fg_estimate_templates', local: loadEstimateTemplates(), push: upsertEstimateTemplate as (r: never) => Promise<void> },
    { table: 'fg_opc_snippets', local: loadOpcSnippets(), push: upsertOpcSnippet as (r: never) => Promise<void> },
    { table: 'fg_library_items', local: loadCustomLibrary(), push: upsertLibraryItem as (r: never) => Promise<void> },
  ]
  for (const { table, local, push } of jobs) {
    if (local.length === 0) continue
    try {
      const { data } = await db.from(table).select('id, updated_at')
      const remote = new Map((data ?? []).map(r => [r.id as string, r.updated_at as string]))
      for (const row of local) {
        const rt = Date.parse(remote.get(row.id) || '') || 0
        const lt = Date.parse(row.updatedAt || '') || 0
        if (!remote.has(row.id) || lt > rt) await push(row as never)
      }
    } catch (e) {
      console.warn('[reconcile] push local-only failed for', table, e)
    }
  }
}

export async function getOpcSnippets(): Promise<OpcSnippet[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_opc_snippets').select('*')
    if (data) return data.map(r => r.data as OpcSnippet)
  }
  return []
}

export async function upsertOpcSnippet(snippet: OpcSnippet): Promise<void> {
  const fresh = saveOpcSnippet(snippet) // localStorage (stamps updatedAt) + notify
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_opc_snippets').upsert({
      id: fresh.id,
      data: fresh,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
    if (error) console.error('[Formation] OPC snippet upsert (Supabase) error:', error.message)
  }
}

export async function deleteOpcSnippetAsync(id: string): Promise<void> {
  deleteOpcSnippet(id)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_opc_snippets').delete().eq('id', id)
    if (error) console.error('[Formation] OPC snippet delete (Supabase) error:', error.message)
  }
}

export async function getEstimateTemplates(): Promise<EstimateTemplate[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_estimate_templates').select('*')
    if (data) return data.map(r => r.data as EstimateTemplate)
  }
  return []
}

export async function upsertEstimateTemplate(template: EstimateTemplate): Promise<void> {
  const fresh = saveEstimateTemplate(template) // localStorage (stamps updatedAt) + notify
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_estimate_templates').upsert({
      id: fresh.id,
      data: fresh,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
    if (error) console.error('[Formation] estimate template upsert (Supabase) error:', error.message)
  }
}

export async function deleteEstimateTemplateAsync(id: string): Promise<void> {
  deleteEstimateTemplate(id)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_estimate_templates').delete().eq('id', id)
    if (error) console.error('[Formation] estimate template delete (Supabase) error:', error.message)
  }
}

export async function upsertSubcontractor(pkg: SubcontractorPackage): Promise<void> {
  saveSubcontractor(pkg) // localStorage (this also stamps updatedAt) + notify
  if (isSupabaseConfigured() && supabase) {
    // Re-read so the blob we push carries the freshly-stamped updatedAt (getSubcontractors reads it
    // back), keeping the DB blob and the local copy on the same stamp for newest-wins.
    const fresh = newestOf(pkg, loadSubcontractors().find(s => s.id === pkg.id))
    const { error } = await supabase.from('fg_subcontractors').upsert({
      id: fresh.id,
      project_id: fresh.projectId,
      data: fresh,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
    if (error) console.error('[Formation] subcontractor upsert (Supabase) error:', error.message)
  }
}

/**
 * Delete a subcontractor package from localStorage AND Supabase. The plain localStorage delete leaves
 * the row in Supabase, which the add-missing sync would then resurrect on the next load — so the
 * delete must reach the DB too.
 */
export async function deleteSubcontractorAsync(id: string): Promise<void> {
  deleteSubcontractor(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_subcontractors').delete().eq('id', id)
    if (error) console.error('[Formation] subcontractor delete (Supabase) error:', error.message)
  }
}

// ── SUPERVISORS ───────────────────────────────────────────────────────────────

export async function getSupervisors(): Promise<Supervisor[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_supervisors').select('*')
    if (data) return data.map(mapSupervisor)
  }
  return loadSupervisors()
}

export async function upsertSupervisor(sup: Supervisor): Promise<void> {
  saveSupervisor(sup) // localStorage (this also stamps updatedAt) + notify
  if (isSupabaseConfigured() && supabase) {
    const fresh = loadSupervisors().find(s => s.id === sup.id) ?? sup
    const { error } = await supabase.from('fg_supervisors').upsert({
      id: fresh.id,
      name: fresh.name,
      colour: fresh.colour,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
    if (error) console.error('[Formation] supervisor upsert (Supabase) error:', error.message)
  }
}

export async function deleteSupervisorAsync(id: string): Promise<void> {
  deleteSupervisor(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_supervisors').delete().eq('id', id)
    if (error) console.error('[Formation] supervisor delete (Supabase) error:', error.message)
  }
}

function mapSupervisor(row: Record<string, unknown>): Supervisor {
  return {
    id: row.id as string,
    name: row.name as string,
    colour: row.colour as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

// ── PROGRESS CLAIMS ───────────────────────────────────────────────────────────
//
// jsonb-blob pattern: the whole claim lives in `data`.

export async function getProgressClaims(): Promise<ProgressClaim[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_progress_claims').select('*')
    if (data) return data.map(r => r.data as ProgressClaim)
  }
  return []
}

export async function upsertProgressClaim(claim: ProgressClaim): Promise<void> {
  saveProgressClaim(claim) // localStorage (this also stamps updatedAt) + notify
  if (isSupabaseConfigured() && supabase) {
    // Re-read so the blob we push carries the freshly-stamped updatedAt (getProgressClaims reads it
    // back), keeping the DB blob and the local copy on the same stamp for newest-wins.
    const fresh = loadProgressClaims().find(c => c.id === claim.id) ?? claim
    const { error } = await supabase.from('fg_progress_claims').upsert({
      id: fresh.id,
      project_id: fresh.projectId,
      data: fresh,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
    if (error) console.error('[Formation] progress claim upsert (Supabase) error:', error.message)
  }
}

/**
 * Delete a progress claim from localStorage AND Supabase. The plain localStorage delete leaves the
 * row in Supabase, which the add-missing sync would then resurrect on the next load — so the delete
 * must reach the DB too.
 */
export async function deleteProgressClaimAsync(id: string): Promise<void> {
  deleteProgressClaim(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_progress_claims').delete().eq('id', id)
    if (error) console.error('[Formation] progress claim delete (Supabase) error:', error.message)
  }
}

// ── GANTT MILESTONES (per-project array, one row per project) ──────────────────
//
// Stored per-project under localStorage key `fg_gantt_milestones_${projectId}`. The save/load helpers
// are component-local (gantt + programme pages), so this layer writes the localStorage key directly
// and mirrors the whole array into the single per-project Supabase row. Replace-semantics: each upsert
// overwrites the project's milestones array wholesale.

function ganttMilestonesKey(projectId: string): string {
  return `fg_gantt_milestones_${projectId}`
}

export async function upsertGanttMilestones(projectId: string, milestones: Milestone[]): Promise<void> {
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(ganttMilestonesKey(projectId), JSON.stringify(milestones)) } catch { /* ignore */ }
  }
  if (ganttSiteProjectId === projectId) {
    await postSite(`/api/site/projects/${projectId}/milestones`, { milestones })
    return
  }
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_gantt_milestones').upsert({
      project_id: projectId,
      milestones,
      updated_at: new Date().toISOString(),
    })
    if (error) console.error('[Formation] gantt milestones upsert (Supabase) error:', error.message)
  }
}

// ── GANTT BASELINES (per-project timestamped list, one row per project) ────────
// localStorage (`fg_gantt_baselines_${projectId}`) is written by the gantt page itself; this mirrors
// the whole list into the per-project Supabase row so the FOREMAN DASHBOARD can compute per-category
// slip server-side (baselines were localStorage-only before). Replace-semantics like the milestones.
export async function upsertGanttBaselinesRemote(projectId: string, baselines: unknown[]): Promise<void> {
  if (ganttSiteProjectId === projectId) return   // setting baselines is an office act; site mode stays local
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_gantt_baselines').upsert({
      project_id: projectId,
      baselines,
      updated_at: new Date().toISOString(),
    })
    if (error) console.error('[Formation] gantt baselines upsert (Supabase) error:', error.message)
  }
}

/** All projects' milestone arrays — used by the gantt/programme mounts + login hydrate to restore. */
export async function getAllGanttMilestones(): Promise<{ projectId: string; milestones: Milestone[] }[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_gantt_milestones').select('*')
    if (data) return data.map(r => ({ projectId: r.project_id as string, milestones: (r.milestones as Milestone[]) || [] }))
  }
  return []
}

// ── MAPPERS ──────────────────────────────────────────────────────────────────

export function mapProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    entity: row.entity as Project['entity'],
    name: row.name as string,
    address: (row.address as string) || '',
    clientName: (row.client_name as string) || '',
    clientPhone: (row.client_phone as string | null) || undefined,
    clientEmail: (row.client_email as string | null) || undefined,
    siteAccessNotes: (row.site_access_notes as string | null) || undefined,
    status: row.status as Project['status'],
    contractValue: (row.contract_value as number) || 0,
    startDate: (row.start_date as string) || '',
    plannedCompletion: (row.planned_completion as string) || '',
    foreman: (row.foreman as string) || '',
    notes: (row.notes as string) || '',
    stage: (row.stage as Project['stage']) || undefined,
    stageChecklist: (row.stage_checklist as Project['stageChecklist']) || undefined,
    nextAction: (row.next_action as string) || undefined,
    invoiceModel: (row.invoice_model as 'stage_based' | 'progress_claim') || undefined,
    targetMarginPct: row.target_margin_pct != null ? Number(row.target_margin_pct) : undefined,
    projectType: (row.project_type as Project['projectType']) || undefined,
    scopes: (row.scopes as Project['scopes']) || undefined,
    baseline: (row.baseline as Project['baseline']) || undefined,
    forecastCompletion: (row.forecast_completion as string | null) || undefined,
    forecastCost: row.forecast_cost != null ? Number(row.forecast_cost) : undefined,
    foremanPin: (row.foreman_pin as string | null) || undefined,
    crewSize: row.crew_size != null ? Number(row.crew_size) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

function mapProposal(row: Record<string, unknown>): DesignProposal {
  return {
    id: row.id as string,
    clientName: row.client_name as string,
    clientName2: (row.client_name2 as string | null) || undefined,
    careOf: (row.care_of as string | null) || undefined,
    clientEmail: row.client_email as string | undefined,
    clientPhone: row.client_phone as string | undefined,
    projectAddress: row.project_address as string,
    status: row.status as DesignProposal['status'],
    phase1Fee: row.phase1_fee as number,
    phase1Scope: row.phase1_scope as string,
    phase2Fee: row.phase2_fee as number,
    phase2Scope: row.phase2_scope as string,
    phase3Fee: row.phase3_fee as number | undefined,
    phase3Scope: row.phase3_scope as string | undefined,
    phases: (row.phases as DesignProposal['phases']) || undefined,
    introText: (row.intro_text as string | null) || undefined,
    emailMessage: (row.email_message as string | null) || undefined,
    programText: (row.program_text as string | null) || undefined,
    ccEmails: (row.cc_emails as string | null) || undefined,
    welcomeVideoUrl: (row.welcome_video_url as string | null) || undefined,
    processVideoUrl: (row.process_video_url as string | null) || undefined,
    validUntil: row.valid_until as string,
    notes: row.notes as string | undefined,
    acceptanceToken: row.acceptance_token as string,
    acceptedAt: row.accepted_at as string | undefined,
    acceptedByName: row.accepted_by_name as string | undefined,
    firstViewedAt: row.first_viewed_at as string | undefined,
    contentBlocks: (row.content_blocks as DesignProposal['contentBlocks']) || [],
    potentialBuildValue: row.potential_build_value != null ? Number(row.potential_build_value) : undefined,
    expectedConstruction: (row.expected_construction as string | null) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

export function mapEstimate(row: Record<string, unknown>): Estimate {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    clientName: (row.client_name as string | null) || undefined,
    projectAddress: (row.project_address as string | null) || undefined,
    name: row.name as string | undefined,
    version: row.version as number,
    status: row.status as Estimate['status'],
    defaultMarkupFormation: row.default_markup_formation as number,
    defaultMarkupSubcontractor: row.default_markup_subcontractor as number,
    lineItems: (row.line_items as Estimate['lineItems']) || [],
    categoryNotes: (row.category_notes as Record<string, string>) || {},
    parentEstimateId: row.parent_estimate_id as string | undefined,
    variationNumber: row.variation_number as number | undefined,
    variationReason: row.variation_reason as string | undefined,
    variationAmount: row.variation_amount != null ? Number(row.variation_amount) : undefined,
    projectMarkups: (row.project_markups as Estimate['projectMarkups']) || undefined,
    roundingMode: (row.rounding_mode as Estimate['roundingMode']) || undefined,
    projectType: (row.project_type as Estimate['projectType']) || undefined,
    proposalId: (row.proposal_id as string | null) || undefined,
    isBaseline: (row.is_baseline as boolean) || undefined,
    sentAt: (row.sent_at as string | null) || undefined,
    acceptedAt: (row.accepted_at as string | null) || undefined,
    acceptanceToken: (row.acceptance_token as string | null) || undefined,
    sendMessage: (row.send_message as string | null) || undefined,
    acceptedByName: (row.accepted_by_name as string | null) || undefined,
    declinedAt: (row.declined_at as string | null) || undefined,
    declinedByName: (row.declined_by_name as string | null) || undefined,
    archived: (row.archived as boolean) || undefined,
    opc: (row.opc as Estimate['opc']) || undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function mapRevenue(row: Record<string, unknown>): WeeklyRevenue {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    entity: row.entity as WeeklyRevenue['entity'],
    weekEnding: row.week_ending as string,
    weekNumber: row.week_number as number,
    plannedRevenue: row.planned_revenue as number,
    actualInvoiced: row.actual_invoiced as number,
    scheduledCost: row.scheduled_cost != null ? Number(row.scheduled_cost) : undefined,
    isDeposit: row.is_deposit as boolean,
    notes: (row.notes as string) || '',
    updatedAt: row.updated_at as string | undefined,
  }
}

// ── DESIGN PROJECTS (accepted-job delivery tracker) ───────────────────────────

export async function getDesignProjects(): Promise<DesignProject[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_design_projects').select('*').order('created_at', { ascending: false })
    if (data) return data.map(mapDesignProject)
  }
  return loadDesignProjects()
}

export async function upsertDesignProject(dp: DesignProject): Promise<void> {
  saveDesignProject(dp)
  if (isSupabaseConfigured() && supabase) {
    const fresh = loadDesignProjects().find(d => d.id === dp.id) ?? dp
    await safeUpsert('fg_design_projects', {
      id: fresh.id,
      proposal_id: fresh.proposalId,
      client_name: fresh.clientName,
      project_address: fresh.projectAddress,
      entity: fresh.entity,
      phase1_fee: fresh.phase1Fee,
      phase1_status: fresh.phase1Status,
      phase1_start_date: fresh.phase1StartDate ?? null,
      phase1_due_date: fresh.phase1DueDate ?? null,
      phase1_completed_date: fresh.phase1CompletedDate ?? null,
      phase1_invoiced_date: fresh.phase1InvoicedDate ?? null,
      phase1_paid_date: fresh.phase1PaidDate ?? null,
      phase1_invoice_number: fresh.phase1InvoiceNumber ?? null,
      phase1_deposit_paid: fresh.phase1DepositPaid,
      phase1_deposit_date: fresh.phase1DepositDate ?? null,
      phase2_fee: fresh.phase2Fee,
      phase2_status: fresh.phase2Status,
      phase2_start_date: fresh.phase2StartDate ?? null,
      phase2_due_date: fresh.phase2DueDate ?? null,
      phase2_completed_date: fresh.phase2CompletedDate ?? null,
      phase2_invoiced_date: fresh.phase2InvoicedDate ?? null,
      phase2_paid_date: fresh.phase2PaidDate ?? null,
      phase2_invoice_number: fresh.phase2InvoiceNumber ?? null,
      phase3_fee: fresh.phase3Fee ?? null,
      phase3_status: fresh.phase3Status ?? null,
      phase3_due_date: fresh.phase3DueDate ?? null,
      phase3_paid_date: fresh.phase3PaidDate ?? null,
      total_fee: fresh.totalFee,
      total_paid: fresh.totalPaid,
      total_outstanding: fresh.totalOutstanding,
      notes: fresh.notes ?? null,
      accepted_at: fresh.acceptedAt ?? null,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

// ── PROGRESS-CLAIM STAGES ─────────────────────────────────────────────────────

export async function getPaymentStages(): Promise<ProgressPaymentStage[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_payment_stages').select('*')
    if (data) return data.map(mapPaymentStage)
  }
  return loadProgressPaymentStages()
}

export async function upsertPaymentStage(stage: ProgressPaymentStage): Promise<void> {
  saveProgressPaymentStage(stage) // localStorage (this also stamps updatedAt)
  if (isSupabaseConfigured() && supabase) {
    // Re-read so we use the freshly-stamped updatedAt; route through safeUpsert so a newer remote row
    // (written by another device) isn't clobbered. fg_payment_stages now has an updated_at column.
    const fresh = loadProgressPaymentStages().find(s => s.id === stage.id) ?? stage
    await safeUpsert('fg_payment_stages', {
      id: fresh.id,
      project_id: fresh.projectId,
      stage_number: fresh.stageNumber,
      description: fresh.description,
      quoted_amount: fresh.quotedAmount,
      paid_to_date: fresh.paidToDate,
      status: fresh.status,
      invoice_id: fresh.invoiceId ?? null,
      invoice_number: fresh.invoiceNumber ?? null,
      invoiced_date: fresh.invoicedDate ?? null,
      invoiced_amount: fresh.invoicedAmount ?? null,
      override_amount: fresh.overrideAmount ?? null,
      invoice_description: fresh.invoiceDescription ?? null,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

/**
 * Delete a progress-claim payment stage from localStorage AND Supabase. The plain localStorage
 * delete leaves the row in Supabase, which the add-missing sync would then resurrect on the next
 * load — so the delete must reach the DB too.
 */
export async function deletePaymentStageAsync(id: string): Promise<void> {
  deleteProgressPaymentStage(id) // localStorage (runs synchronously before any await)
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('fg_payment_stages').delete().eq('id', id)
    if (error) console.error('[Formation] payment stage delete (Supabase) error:', error.message)
  }
}

// ── COST ACTUALS ──────────────────────────────────────────────────────────────

export async function getActuals(): Promise<WeeklyActual[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_actuals').select('*')
    if (data) return data.map(mapActual)
  }
  return loadWeeklyActuals()
}

export async function upsertActual(actual: WeeklyActual): Promise<void> {
  saveWeeklyActual(actual) // localStorage (this also stamps updatedAt)
  if (isSupabaseConfigured() && supabase) {
    // Re-read so we use the freshly-stamped updatedAt; route through safeUpsert so a newer remote row
    // isn't clobbered. fg_actuals now has an updated_at column. (Cost rows are largely immutable, so
    // this is belt-and-suspenders, but keeps every sync path on the conflict-aware primitive.)
    const fresh = loadWeeklyActuals().find(a => a.id === actual.id) ?? actual
    await safeUpsert('fg_actuals', {
      id: fresh.id,
      project_id: fresh.projectId,
      category: fresh.category,
      week_ending: fresh.weekEnding,
      supply_cost: fresh.supplyCost,
      labour_cost: fresh.labourCost,
      notes: fresh.notes ?? null,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

// ── GANTT (recovery read) ─────────────────────────────────────────────────────

/** All Gantt rows across all projects — used by the login recovery to restore a wiped browser. */
export async function getAllGanttEntries(): Promise<GanttEntry[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_gantt').select('*')
    if (data) return data.map(mapGanttEntry)
  }
  return []
}

// ── TAKEOFF (cross-device: JSON in fg_takeoffs, plan images in the takeoff-plans bucket) ─────────
//
// Plan images are base64 data URIs far too large for a jsonb row (and the localStorage cache), so
// they go to Supabase Storage and the row stores each plan's public URL in place of the base64.
// On load we hydrate the URLs back to base64 so the canvas/render pipeline is unchanged.

const TAKEOFF_BUCKET = 'takeoff-plans'
const uploadedPlanPaths = new Set<string>() // plan images are immutable — upload once per session

function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const comma = dataUrl.indexOf(',')
  const contentType = /data:(.*?);base64/.exec(dataUrl.slice(0, comma))?.[1] || 'image/png'
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { blob: new Blob([bytes], { type: contentType }), contentType }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function upsertTakeoff(takeoff: TakeoffData): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return
  // Don't clobber a newer remote copy written by another device (optimistic concurrency).
  const { data: existing } = await supabase.from('fg_takeoffs').select('updated_at').eq('estimate_id', takeoff.estimateId).maybeSingle()
  if (existing?.updated_at && takeoff.updatedAt && Date.parse(existing.updated_at as string) > Date.parse(takeoff.updatedAt)) {
    return
  }
  const plansForRemote: TakeoffData['plans'] = []
  for (const plan of takeoff.plans) {
    if (typeof plan.dataUrl === 'string' && plan.dataUrl.startsWith('data:')) {
      const path = `${takeoff.estimateId}/${plan.id}`
      if (!uploadedPlanPaths.has(path)) {
        try {
          const { blob, contentType } = dataUrlToBlob(plan.dataUrl)
          const { error } = await supabase.storage.from(TAKEOFF_BUCKET).upload(path, blob, { upsert: true, contentType })
          if (error && !/exists/i.test(error.message)) {
            console.warn('[takeoff] plan image upload failed; skipping remote sync', error.message)
            return // don't write a row that points at a missing image
          }
          uploadedPlanPaths.add(path)
        } catch (e) {
          console.warn('[takeoff] plan image upload threw; skipping remote sync', e)
          return
        }
      }
      const { data: pub } = supabase.storage.from(TAKEOFF_BUCKET).getPublicUrl(path)
      plansForRemote.push({ ...plan, dataUrl: pub.publicUrl })
    } else {
      plansForRemote.push(plan) // already a URL, or no image
    }
  }
  const remoteData: TakeoffData = { ...takeoff, plans: plansForRemote }
  const { error } = await supabase.from('fg_takeoffs').upsert({
    estimate_id: takeoff.estimateId,
    data: remoteData,
    updated_at: takeoff.updatedAt ?? new Date().toISOString(),
  })
  if (error) console.warn('[takeoff] remote save failed (kept locally):', error.message)
}

export async function getTakeoff(estimateId: string, opts?: { hydrateImages?: boolean }): Promise<TakeoffData | null> {
  if (!isSupabaseConfigured() || !supabase) return null
  const { data: row, error } = await supabase.from('fg_takeoffs').select('data, updated_at').eq('estimate_id', estimateId).maybeSingle()
  if (error || !row?.data) return null
  const t = row.data as TakeoffData
  // The editor needs base64 images for the canvas; the line-items summary only needs measurements,
  // so it can skip the (potentially heavy) image download.
  const plans = opts?.hydrateImages === false
    ? (t.plans || [])
    : await Promise.all((t.plans || []).map(async plan => {
        if (typeof plan.dataUrl === 'string' && /^https?:\/\//.test(plan.dataUrl)) {
          try {
            const res = await fetch(plan.dataUrl)
            if (res.ok) return { ...plan, dataUrl: await blobToDataUrl(await res.blob()) }
          } catch { /* leave the URL — an <img> can still load it while online */ }
        }
        return plan
      }))
  return { ...t, plans, updatedAt: (row.updated_at as string) ?? t.updatedAt }
}

// ── MAPPERS (new) ─────────────────────────────────────────────────────────────

function mapDesignProject(row: Record<string, unknown>): DesignProject {
  return {
    id: row.id as string,
    proposalId: row.proposal_id as string,
    clientName: (row.client_name as string) || '',
    projectAddress: (row.project_address as string) || '',
    entity: 'design',
    phase1Fee: Number(row.phase1_fee) || 0,
    phase1Status: row.phase1_status as DesignProject['phase1Status'],
    phase1StartDate: (row.phase1_start_date as string | null) || undefined,
    phase1DueDate: (row.phase1_due_date as string | null) || undefined,
    phase1CompletedDate: (row.phase1_completed_date as string | null) || undefined,
    phase1InvoicedDate: (row.phase1_invoiced_date as string | null) || undefined,
    phase1PaidDate: (row.phase1_paid_date as string | null) || undefined,
    phase1InvoiceNumber: (row.phase1_invoice_number as string | null) || undefined,
    phase1DepositPaid: Boolean(row.phase1_deposit_paid),
    phase1DepositDate: (row.phase1_deposit_date as string | null) || undefined,
    phase2Fee: Number(row.phase2_fee) || 0,
    phase2Status: row.phase2_status as DesignProject['phase2Status'],
    phase2StartDate: (row.phase2_start_date as string | null) || undefined,
    phase2DueDate: (row.phase2_due_date as string | null) || undefined,
    phase2CompletedDate: (row.phase2_completed_date as string | null) || undefined,
    phase2InvoicedDate: (row.phase2_invoiced_date as string | null) || undefined,
    phase2PaidDate: (row.phase2_paid_date as string | null) || undefined,
    phase2InvoiceNumber: (row.phase2_invoice_number as string | null) || undefined,
    phase3Fee: row.phase3_fee != null ? Number(row.phase3_fee) : undefined,
    phase3Status: (row.phase3_status as DesignProject['phase3Status']) || undefined,
    phase3DueDate: (row.phase3_due_date as string | null) || undefined,
    phase3PaidDate: (row.phase3_paid_date as string | null) || undefined,
    totalFee: Number(row.total_fee) || 0,
    totalPaid: Number(row.total_paid) || 0,
    totalOutstanding: Number(row.total_outstanding) || 0,
    notes: (row.notes as string | null) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    acceptedAt: (row.accepted_at as string | null) || undefined,
  }
}

function mapPaymentStage(row: Record<string, unknown>): ProgressPaymentStage {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    stageNumber: (row.stage_number as string) || '',
    description: (row.description as string) || '',
    quotedAmount: Number(row.quoted_amount) || 0,
    paidToDate: Number(row.paid_to_date) || 0,
    status: row.status as ProgressPaymentStage['status'],
    invoiceId: (row.invoice_id as string | null) || undefined,
    invoicedDate: (row.invoiced_date as string | null) || undefined,
    invoiceNumber: (row.invoice_number as string | null) || undefined,
    invoicedAmount: row.invoiced_amount != null ? Number(row.invoiced_amount) : undefined,
    overrideAmount: row.override_amount != null ? Number(row.override_amount) : undefined,
    invoiceDescription: (row.invoice_description as string | null) || undefined,
    updatedAt: (row.updated_at as string | null) || undefined,
  }
}

function mapActual(row: Record<string, unknown>): WeeklyActual {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    category: row.category as string,
    weekEnding: row.week_ending as string,
    supplyCost: Number(row.supply_cost) || 0,
    labourCost: Number(row.labour_cost) || 0,
    notes: (row.notes as string | null) || undefined,
    updatedAt: (row.updated_at as string | null) || undefined,
  }
}

export function mapGanttEntry(row: Record<string, unknown>): GanttEntry {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    estimateId: (row.estimate_id as string | null) || '',
    category: row.category as string,
    crewType: row.crew_type as GanttEntry['crewType'],
    budgetedRevenue: Number(row.budgeted_revenue) || 0,
    budgetedCost: Number(row.budgeted_cost) || 0,
    segments: (row.segments as GanttEntry['segments']) || [],
    subtasks: (row.subtasks as GanttEntry['subtasks']) || [],
    notes: (row.notes as string | null) || undefined,
    updatedAt: row.updated_at as string | undefined,
  }
}
