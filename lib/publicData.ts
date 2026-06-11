// Typed wrappers around the Supabase RPC functions that back the public surfaces
// (proposal acceptance, foreman timesheet). These RPCs run as SECURITY DEFINER on the
// server so the anon role can hit them without needing direct table read access.
//
// See `supabase/migrations/02-rls-lockdown.sql` for the function definitions.
//
// All functions degrade gracefully when Supabase isn't configured — they fall back to
// the same localStorage paths the admin's browser uses today. That's the right behaviour
// for the admin's own device; for an external client/foreman with empty localStorage the
// fallback returns null (proposal) or empty arrays (gantt/actuals).

import { getSupabaseBrowser } from './supabaseBrowser'
import { isSupabaseConfigured, supabase } from './supabase'
import {
  loadProposals,
  saveProposal as saveLocalProposal,
  loadProjects,
  loadGanttEntries,
  loadWeeklyActuals,
  saveWeeklyActual as saveLocalActual,
} from './storage'
import { generateId } from './utils'
import type { DesignProposal, Project, GanttEntry, WeeklyActual } from '@/types'

function client() {
  // Prefer the cookie-bound browser client when Supabase Auth is in play, fall back to
  // the legacy module-level client so the public routes still work in custom-auth mode.
  return getSupabaseBrowser() ?? supabase
}

// ── Proposal acceptance ──────────────────────────────────────────────────────

export async function getProposalByToken(token: string): Promise<DesignProposal | null> {
  const c = client()
  if (c && isSupabaseConfigured()) {
    const { data, error } = await c.rpc('get_proposal_by_token', { p_token: token })
    if (!error && Array.isArray(data) && data.length > 0) {
      return mapProposalRow(data[0])
    }
  }
  // Local fallback — works on the admin's device, returns null on a client's empty browser
  return loadProposals().find(p => p.acceptanceToken === token) ?? null
}

export async function acceptProposalByToken(token: string, acceptorName: string): Promise<DesignProposal | null> {
  const c = client()
  if (c && isSupabaseConfigured()) {
    const { data, error } = await c.rpc('accept_proposal_by_token', {
      p_token: token,
      p_accepted_by_name: acceptorName,
    })
    if (!error && Array.isArray(data) && data.length > 0) {
      const accepted = mapProposalRow(data[0])
      // Also write to local so a subsequent reload on the admin's browser shows the new state
      saveLocalProposal(accepted)
      return accepted
    }
  }
  // Local fallback — accept against localStorage (admin testing flow)
  const all = loadProposals()
  const found = all.find(p => p.acceptanceToken === token)
  if (!found) return null
  const updated: DesignProposal = {
    ...found,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    acceptedByName: acceptorName,
  }
  saveLocalProposal(updated)
  return updated
}

// ── Foreman timesheet ────────────────────────────────────────────────────────

export async function getProjectByForemanPin(pin: string): Promise<Project | null> {
  const c = client()
  if (c && isSupabaseConfigured()) {
    const { data, error } = await c.rpc('get_project_by_foreman_pin', { p_pin: pin })
    if (!error && Array.isArray(data) && data.length > 0) {
      return mapProjectRow(data[0])
    }
  }
  return loadProjects().find(p => p.foremanPin?.toUpperCase() === pin.toUpperCase()) ?? null
}

export async function getGanttByForemanPin(pin: string): Promise<GanttEntry[]> {
  const c = client()
  if (c && isSupabaseConfigured()) {
    const { data, error } = await c.rpc('get_gantt_by_foreman_pin', { p_pin: pin })
    if (!error && Array.isArray(data)) {
      return data.map(mapGanttRow)
    }
  }
  // Fallback needs the project id — resolve via local lookup
  const project = loadProjects().find(p => p.foremanPin?.toUpperCase() === pin.toUpperCase())
  return project ? loadGanttEntries(project.id) : []
}

export async function getActualsByForemanPin(pin: string): Promise<WeeklyActual[]> {
  const c = client()
  if (c && isSupabaseConfigured()) {
    const { data, error } = await c.rpc('get_actuals_by_foreman_pin', { p_pin: pin })
    if (!error && Array.isArray(data)) {
      return data.map(mapActualRow)
    }
  }
  const project = loadProjects().find(p => p.foremanPin?.toUpperCase() === pin.toUpperCase())
  return project ? loadWeeklyActuals(project.id) : []
}

export async function insertForemanActual(
  pin: string,
  payload: { category: string; weekEnding: string; supplyCost: number; labourCost: number; notes?: string },
): Promise<boolean> {
  const c = client()
  if (c && isSupabaseConfigured()) {
    const { error } = await c.rpc('insert_foreman_actual', {
      p_pin: pin,
      p_category: payload.category,
      p_week_ending: payload.weekEnding,
      p_supply_cost: payload.supplyCost,
      p_labour_cost: payload.labourCost,
      p_notes: payload.notes ?? '',
    })
    if (!error) {
      // Mirror to local for admin's-browser reads of the same data
      const project = loadProjects().find(p => p.foremanPin?.toUpperCase() === pin.toUpperCase())
      if (project) {
        saveLocalActual({
          id: generateId(),
          projectId: project.id,
          category: payload.category,
          weekEnding: payload.weekEnding,
          supplyCost: payload.supplyCost,
          labourCost: payload.labourCost,
          notes: payload.notes ?? '',
        })
      }
      return true
    }
  }
  // Local fallback
  const project = loadProjects().find(p => p.foremanPin?.toUpperCase() === pin.toUpperCase())
  if (!project) return false
  saveLocalActual({
    id: generateId(),
    projectId: project.id,
    category: payload.category,
    weekEnding: payload.weekEnding,
    supplyCost: payload.supplyCost,
    labourCost: payload.labourCost,
    notes: payload.notes ?? '',
  })
  return true
}

// ── Mappers (Postgres snake_case → TS camelCase) ─────────────────────────────

function mapProposalRow(row: Record<string, unknown>): DesignProposal {
  return {
    id: row.id as string,
    clientName: row.client_name as string,
    clientName2: (row.client_name2 as string | null) || undefined,
    clientEmail: row.client_email as string | undefined,
    clientPhone: row.client_phone as string | undefined,
    projectAddress: (row.project_address as string) || '',
    status: row.status as DesignProposal['status'],
    phase1Fee: Number(row.phase1_fee) || 0,
    phase1Scope: (row.phase1_scope as string) || '',
    phase2Fee: Number(row.phase2_fee) || 0,
    phase2Scope: (row.phase2_scope as string) || '',
    phase3Fee: row.phase3_fee != null ? Number(row.phase3_fee) : undefined,
    phase3Scope: row.phase3_scope as string | undefined,
    phases: (row.phases as DesignProposal['phases']) || undefined,
    introText: (row.intro_text as string | null) || undefined,
    emailMessage: (row.email_message as string | null) || undefined,
    ccEmails: (row.cc_emails as string | null) || undefined,
    welcomeVideoUrl: (row.welcome_video_url as string | null) || undefined,
    processVideoUrl: (row.process_video_url as string | null) || undefined,
    validUntil: (row.valid_until as string) || '',
    notes: row.notes as string | undefined,
    acceptanceToken: row.acceptance_token as string,
    acceptedAt: row.accepted_at as string | undefined,
    acceptedByName: row.accepted_by_name as string | undefined,
    contentBlocks: (row.content_blocks as DesignProposal['contentBlocks']) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

function mapProjectRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    entity: row.entity as Project['entity'],
    name: row.name as string,
    address: (row.address as string) || '',
    clientName: (row.client_name as string) || '',
    status: row.status as Project['status'],
    contractValue: Number(row.contract_value) || 0,
    startDate: (row.start_date as string) || '',
    plannedCompletion: (row.planned_completion as string) || '',
    foreman: (row.foreman as string) || '',
    foremanPin: row.foreman_pin as string | undefined,
    notes: (row.notes as string) || '',
    stage: row.stage as Project['stage'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

function mapGanttRow(row: Record<string, unknown>): GanttEntry {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    estimateId: row.estimate_id as string,
    category: row.category as string,
    crewType: row.crew_type as GanttEntry['crewType'],
    budgetedRevenue: Number(row.budgeted_revenue) || 0,
    budgetedCost: Number(row.budgeted_cost) || 0,
    segments: (row.segments as GanttEntry['segments']) || [],
    subtasks: (row.subtasks as GanttEntry['subtasks']) || [],
    notes: row.notes as string | undefined,
  }
}

function mapActualRow(row: Record<string, unknown>): WeeklyActual {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    category: row.category as string,
    weekEnding: row.week_ending as string,
    supplyCost: Number(row.supply_cost) || 0,
    labourCost: Number(row.labour_cost) || 0,
    notes: row.notes as string | undefined,
  }
}
