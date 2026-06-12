import { supabase, isSupabaseConfigured } from './supabase'
import {
  loadProposals,
  saveProposal,
  loadProjects,
  saveProject,
  loadEstimates,
  saveEstimate,
  loadWeeklyRevenue,
  saveWeeklyRevenue,
  saveGanttEntries,
} from './storage'
import type { DesignProposal, Project, Estimate, WeeklyRevenue, GanttEntry } from '@/types'

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
    // Re-read so we use the freshly-stamped updatedAt
    const fresh = loadProjects().find(p => p.id === project.id) ?? project
    await safeUpsert('fg_projects', {
      id: fresh.id,
      entity: fresh.entity,
      name: fresh.name,
      address: fresh.address,
      client_name: fresh.clientName,
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
      // Only push the foreman PIN when we actually have one — never null out an existing PIN in the
      // DB. It's used by the foreman portal, not edited in the office UI, so the office copy can lack
      // it; a blanket `foreman_pin: null` would lock foremen out.
      ...(fresh.foremanPin ? { foreman_pin: fresh.foremanPin } : {}),
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
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
    let fresh = loadProposals().find(p => p.id === proposal.id) ?? proposal
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
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
}

// ── ESTIMATES ────────────────────────────────────────────────────────────────

export async function getEstimates(): Promise<Estimate[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_estimates').select('*').order('created_at', { ascending: false })
    if (data) return data.map(mapEstimate)
  }
  return loadEstimates()
}

export async function upsertEstimate(estimate: Estimate): Promise<void> {
  saveEstimate(estimate)
  if (isSupabaseConfigured() && supabase) {
    const fresh = loadEstimates().find(e => e.id === estimate.id) ?? estimate
    await safeUpsert('fg_estimates', {
      id: fresh.id,
      project_id: fresh.projectId || null,   // '' would violate the FK to fg_projects
      project_name: fresh.projectName,
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
      notes: fresh.notes,
      updated_at: fresh.updatedAt ?? new Date().toISOString(),
    })
  }
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

// ── GANTT ────────────────────────────────────────────────────────────────────

/**
 * Persist a project's Gantt entries to localStorage AND Supabase. The Gantt is otherwise the one
 * internal dataset that never reaches the DB (no per-record upsert, not in the login bulk-sync),
 * so without this it lives only in the browser. Mirrors saveGanttEntries' replace-the-project
 * semantics: wipe this project's fg_gantt rows, then insert the current set.
 */
export async function upsertGanttEntries(projectId: string, entries: GanttEntry[]): Promise<void> {
  saveGanttEntries(projectId, entries)   // localStorage (immediate)
  if (!isSupabaseConfigured() || !supabase) return
  await supabase.from('fg_gantt').delete().eq('project_id', projectId)
  if (entries.length === 0) return
  const rows = entries.map(e => ({
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
  }))
  await supabase.from('fg_gantt').insert(rows)
}

/**
 * Replace this project's Gantt-generated revenue rows in Supabase (the localStorage side is handled
 * by the caller via deleteGanttGeneratedRevenueByProject + saveWeeklyRevenue). Deletes the prior
 * "(Gantt)"-tagged rows for the project, then inserts the fresh forecast — so regenerating a forecast
 * doesn't leave stale rows in the DB. Manual/deposit rows (not tagged) are untouched.
 */
export async function replaceGanttRevenueRemote(projectId: string, rows: WeeklyRevenue[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return
  await supabase.from('fg_revenue').delete().eq('project_id', projectId).like('notes', '%(Gantt)')
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

// ── MAPPERS ──────────────────────────────────────────────────────────────────

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    entity: row.entity as Project['entity'],
    name: row.name as string,
    address: (row.address as string) || '',
    clientName: (row.client_name as string) || '',
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
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

function mapProposal(row: Record<string, unknown>): DesignProposal {
  return {
    id: row.id as string,
    clientName: row.client_name as string,
    clientName2: (row.client_name2 as string | null) || undefined,
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
    contentBlocks: (row.content_blocks as DesignProposal['contentBlocks']) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

function mapEstimate(row: Record<string, unknown>): Estimate {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
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
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapRevenue(row: Record<string, unknown>): WeeklyRevenue {
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
