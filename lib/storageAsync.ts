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
} from './storage'
import type { DesignProposal, Project, Estimate, WeeklyRevenue } from '@/types'

// ── PROJECTS ──────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('fg_projects').select('*').order('created_at', { ascending: false })
    if (data) return data.map(mapProject)
  }
  return loadProjects()
}

export async function upsertProject(project: Project): Promise<void> {
  saveProject(project) // always save to localStorage
  if (isSupabaseConfigured() && supabase) {
    await supabase.from('fg_projects').upsert({
      id: project.id,
      entity: project.entity,
      name: project.name,
      address: project.address,
      client_name: project.clientName,
      status: project.status,
      contract_value: project.contractValue,
      start_date: project.startDate,
      planned_completion: project.plannedCompletion,
      foreman: project.foreman,
      notes: project.notes,
      stage: project.stage || null,
      stage_checklist: project.stageChecklist || null,
      next_action: project.nextAction || null,
      invoice_model: project.invoiceModel || null,
      updated_at: new Date().toISOString(),
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
    await supabase.from('fg_proposals').upsert({
      id: proposal.id,
      client_name: proposal.clientName,
      client_email: proposal.clientEmail,
      client_phone: proposal.clientPhone,
      project_address: proposal.projectAddress,
      status: proposal.status,
      phase1_fee: proposal.phase1Fee,
      phase1_scope: proposal.phase1Scope,
      phase2_fee: proposal.phase2Fee,
      phase2_scope: proposal.phase2Scope,
      phase3_fee: proposal.phase3Fee,
      phase3_scope: proposal.phase3Scope,
      valid_until: proposal.validUntil,
      notes: proposal.notes,
      acceptance_token: proposal.acceptanceToken,
      accepted_at: proposal.acceptedAt,
      accepted_by_name: proposal.acceptedByName,
      content_blocks: proposal.contentBlocks || [],
      updated_at: new Date().toISOString(),
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
    await supabase.from('fg_estimates').upsert({
      id: estimate.id,
      project_id: estimate.projectId,
      project_name: estimate.projectName,
      name: estimate.name,
      version: estimate.version,
      status: estimate.status,
      default_markup_formation: estimate.defaultMarkupFormation,
      default_markup_subcontractor: estimate.defaultMarkupSubcontractor,
      line_items: estimate.lineItems,
      category_notes: estimate.categoryNotes || {},
      parent_estimate_id: estimate.parentEstimateId,
      variation_number: estimate.variationNumber,
      variation_reason: estimate.variationReason,
      notes: estimate.notes,
      updated_at: new Date().toISOString(),
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
    await supabase.from('fg_revenue').upsert({
      id: entry.id,
      project_id: entry.projectId,
      project_name: entry.projectName,
      entity: entry.entity,
      week_ending: entry.weekEnding,
      week_number: entry.weekNumber,
      planned_revenue: entry.plannedRevenue,
      actual_invoiced: entry.actualInvoiced,
      is_deposit: entry.isDeposit,
      notes: entry.notes,
    })
  }
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
    createdAt: row.created_at as string,
  }
}

function mapProposal(row: Record<string, unknown>): DesignProposal {
  return {
    id: row.id as string,
    clientName: row.client_name as string,
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
    validUntil: row.valid_until as string,
    notes: row.notes as string | undefined,
    acceptanceToken: row.acceptance_token as string,
    acceptedAt: row.accepted_at as string | undefined,
    acceptedByName: row.accepted_by_name as string | undefined,
    contentBlocks: (row.content_blocks as DesignProposal['contentBlocks']) || [],
    createdAt: row.created_at as string,
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
    isDeposit: row.is_deposit as boolean,
    notes: (row.notes as string) || '',
  }
}
