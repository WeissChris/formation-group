// Client-side wrappers for the /site cockpit. Everything goes through the /api/site/* routes (which
// enforce the supervisor session + project ownership server-side); the browser never touches Supabase
// directly here. Keep these thin and typed.

import type { GanttEntry, WeeklyActual, SubcontractorPackage, Estimate } from '@/types'
import { mapEstimate } from '@/lib/storageAsync'
import { supabase } from '@/lib/supabase'

export interface SiteProjectCard {
  id: string
  name: string
  address: string
  clientName: string
  status: string
  startDate: string
  plannedCompletion: string
  stage: string | null
}

export interface SiteProject extends SiteProjectCard {
  clientPhone: string
  clientEmail: string
  siteAccessNotes: string
  crewSize: number | null
  foreman: string
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function siteMe(): Promise<{ supervisorId: string; name: string } | null> {
  const d = await getJson<{ ok: boolean; supervisorId: string; name: string }>('/api/site/me')
  return d?.ok ? { supervisorId: d.supervisorId, name: d.name } : null
}

export async function siteLogin(supervisorId: string, passcode: string): Promise<boolean> {
  const res = await fetch('/api/site/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supervisorId, passcode }),
  })
  return res.ok
}

export async function siteLogout(): Promise<void> {
  await fetch('/api/site/logout', { method: 'POST' })
}

export async function listSiteSupervisors(): Promise<{ id: string; name: string }[]> {
  const d = await getJson<{ supervisors: { id: string; name: string }[] }>('/api/site/supervisors')
  return d?.supervisors ?? []
}

// ── Project data ───────────────────────────────────────────────────────────────

export async function getSiteProjects(): Promise<SiteProjectCard[]> {
  const d = await getJson<{ ok: boolean; projects: SiteProjectCard[] }>('/api/site/projects')
  return d?.projects ?? []
}

export async function getSiteProject(id: string): Promise<SiteProject | null> {
  const d = await getJson<{ ok: boolean; project: SiteProject }>(`/api/site/projects/${id}`)
  return d?.ok ? d.project : null
}

export async function getSiteGantt(id: string): Promise<GanttEntry[]> {
  const d = await getJson<{ ok: boolean; entries: GanttEntry[] }>(`/api/site/projects/${id}/gantt`)
  return d?.entries ?? []
}

// The accepted estimate for the project's BOQ, mapped to the same Estimate shape the office uses (so
// estimateCalculations agree). Returns null when nothing is accepted / estimated yet.
export async function getSiteBoq(id: string): Promise<Estimate | null> {
  const d = await getJson<{ ok: boolean; estimate: Record<string, unknown> | null }>(`/api/site/projects/${id}/boq`)
  return d?.ok && d.estimate ? mapEstimate(d.estimate) : null
}

export async function getSiteActuals(id: string): Promise<WeeklyActual[]> {
  const d = await getJson<{ ok: boolean; actuals: WeeklyActual[] }>(`/api/site/projects/${id}/actuals`)
  return d?.actuals ?? []
}

export async function getSiteSubbies(id: string): Promise<SubcontractorPackage[]> {
  const d = await getJson<{ ok: boolean; subbies: SubcontractorPackage[] }>(`/api/site/projects/${id}/subbies`)
  return d?.subbies ?? []
}

// Real logged labour hours from Xero timesheets (fg_xero_project_hours). totalHours null =
// no rows yet -> the Scorecard falls back to the $-derived labour figure.
export async function getSiteHours(id: string): Promise<{ totalHours: number | null; weeks: { weekEnding: string; hours: number }[] }> {
  const d = await getJson<{ ok: boolean; totalHours: number | null; weeks: { weekEnding: string; hours: number }[] }>(`/api/site/projects/${id}/hours`)
  return d?.ok ? { totalHours: d.totalHours, weeks: d.weeks } : { totalHours: null, weeks: [] }
}

// ── Plans (private Supabase Storage bucket, one folder per project) ──────────────

export interface SitePlan { name: string; path: string; size: number; updatedAt: string; url: string }

export async function getSitePlans(id: string): Promise<SitePlan[]> {
  const d = await getJson<{ ok: boolean; files: SitePlan[] }>(`/api/site/projects/${id}/plans`)
  return d?.files ?? []
}

// Mint a signed upload URL server-side, then push the file bytes straight to Storage (bypassing the
// Vercel function-body limit). Returns false on any failure.
export async function uploadSitePlan(id: string, file: File): Promise<boolean> {
  if (!supabase) return false
  const res = await fetch(`/api/site/projects/${id}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name }),
  })
  if (!res.ok) return false
  const { path, token } = await res.json() as { path: string; token: string }
  const { error } = await supabase.storage.from('project-plans').uploadToSignedUrl(path, token, file)
  return !error
}

export async function deleteSitePlan(id: string, path: string): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/plans?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  return res.ok
}

export async function saveSiteActual(
  id: string,
  payload: { category: string; weekEnding: string; supplyCost: number; labourCost: number; notes?: string },
): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/actuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.ok
}
