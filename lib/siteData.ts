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

// Xero-sourced actuals for the Scorecard: real logged labour hours (fg_xero_project_hours) +
// supply spend to date (fg_xero_project_costs minus labour/subbie accounts). Nulls = not synced
// yet -> the Scorecard falls back instead of showing a false 0.
export async function getSiteHours(id: string): Promise<{ totalHours: number | null; weeks: { weekEnding: string; hours: number }[]; supplyCost: number | null }> {
  const d = await getJson<{ ok: boolean; totalHours: number | null; weeks: { weekEnding: string; hours: number }[]; supplyCost: number | null }>(`/api/site/projects/${id}/hours`)
  return d?.ok ? { totalHours: d.totalHours, weeks: d.weeks, supplyCost: d.supplyCost ?? null } : { totalHours: null, weeks: [], supplyCost: null }
}

// Gantt milestones (read-only for the dashboard's "next milestones" card).
export interface SiteMilestone { id: string; label: string; date: string; colour?: string; value?: number }
export async function getSiteMilestones(id: string): Promise<SiteMilestone[]> {
  const d = await getJson<{ ok: boolean; milestones: SiteMilestone[] }>(`/api/site/projects/${id}/milestones`)
  return d?.milestones ?? []
}

// Safety snapshot for the cockpit's Safety tab: linked sf_site + board + register + the
// project's safety docs (SWMS with ack counts, toolbox meetings, incidents).
import type { SafetySite, SiteBoard, SiteVisit } from '@/lib/safety'
import type { Swms, ToolboxMeeting, Incident } from '@/lib/safetyDocs'
export interface SiteSafety {
  site: SafetySite | null
  board: SiteBoard | null
  onSiteNow: SiteVisit[]
  today: SiteVisit[]
  inductionCount: number
  swms: (Swms & { ackCount: number; ackNames: string[] })[]
  toolbox: ToolboxMeeting[]
  incidents: Incident[]
  subbieCompliance: { name: string; status: 'ok' | 'expiring' | 'missing_or_expired' | 'unlinked' }[]
}
export async function getSiteSafety(id: string): Promise<SiteSafety> {
  const d = await getJson<{ ok: boolean } & SiteSafety>(`/api/site/projects/${id}/safety`)
  return d?.ok
    ? {
        site: d.site, board: d.board ?? null, onSiteNow: d.onSiteNow ?? [], today: d.today ?? [],
        inductionCount: d.inductionCount ?? 0, swms: d.swms ?? [], toolbox: d.toolbox ?? [], incidents: d.incidents ?? [],
        subbieCompliance: d.subbieCompliance ?? [],
      }
    : { site: null, board: null, onSiteNow: [], today: [], inductionCount: 0, swms: [], toolbox: [], incidents: [], subbieCompliance: [] }
}

// The latest office baseline, reduced to per-category start/end - the dashboard slip card's
// reference schedule - plus the ORIGINAL (first-baseline) anchor for the schedule-creep score
// penalty. null until the office sets a baseline on the gantt.
export interface SiteBaseline {
  capturedAt: string
  categories: { category: string; start: string; end: string }[]
  original?: { endDate: string; durationDays: number } | null
}
export async function getSiteBaseline(id: string): Promise<SiteBaseline | null> {
  const d = await getJson<{ ok: boolean; baseline: SiteBaseline | null }>(`/api/site/projects/${id}/baseline`)
  return d?.ok ? d.baseline : null
}

// ── Subbie bookings (booked tick + append-only time-stamped comment log per category) ─
export interface BookingComment { text: string; by: string; at: string }
export interface SubbieBooking { category: string; booked: boolean; comments: BookingComment[]; updatedAt?: string }
export async function getSiteBookings(id: string): Promise<SubbieBooking[]> {
  const d = await getJson<{ ok: boolean; bookings: SubbieBooking[] }>(`/api/site/projects/${id}/bookings`)
  return d?.bookings ?? []
}
export async function saveSiteBooking(id: string, payload: { category: string; booked?: boolean; addComment?: string }): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return res.ok
}

// ── Variations (foreman-raised, capped $1000, client digital approval) ───────────
export interface SiteVariation {
  id: string
  number: number
  reason: string
  amount: number
  status: string   // 'sent' -> pending; 'accepted'; 'declined'
  acceptedByName?: string
  acceptedAt?: string | null
  declinedAt?: string | null
  approvalUrl?: string | null
}
export async function getSiteVariations(id: string): Promise<SiteVariation[]> {
  const d = await getJson<{ ok: boolean; variations: SiteVariation[] }>(`/api/site/projects/${id}/variations`)
  return d?.variations ?? []
}
export async function createSiteVariation(id: string, payload: { description: string; amount: number }): Promise<
  { ok: true; variation: SiteVariation; emailed: boolean; dryRun: boolean; clientEmail: string | null } |
  { ok: false; error: string; cap?: number }
> {
  const res = await fetch(`/api/site/projects/${id}/variations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return res.ok ? body : { ok: false, error: body.error || 'failed', cap: body.cap }
}

/** Foreman safety writes (toolbox / incident / swms_ack) - see the route for shapes. */
export async function postSiteSafety(id: string, payload: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/safety`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return res.ok
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

// ── Pre-handover walkthrough (Zero-Defect Handover / Blue Tape audit) ─────────────
import type { HandoverChecklist, HandoverData } from '@/lib/handoverChecklist'
export type { HandoverChecklist, HandoverData }

export async function getSiteHandover(id: string): Promise<HandoverChecklist | null> {
  const d = await getJson<{ ok: boolean; checklist: HandoverChecklist }>(`/api/site/projects/${id}/handover`)
  return d?.ok ? d.checklist : null
}

export async function saveSiteHandover(id: string, payload: { data?: HandoverData; signOff?: boolean }): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/handover`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return res.ok
}

// ── Handover: irrigation plan markup ──────────────────────────────────────────
import type { IrrigationZone, IrrigationPlan } from '@/lib/irrigationPlan'
export type { IrrigationZone, IrrigationPlan }

export async function getSiteIrrigation(id: string): Promise<IrrigationPlan> {
  const d = await getJson<{ ok: boolean } & IrrigationPlan>(`/api/site/projects/${id}/irrigation`)
  return d?.ok ? { planUrl: d.planUrl, planW: d.planW, planH: d.planH, zones: d.zones } : { planUrl: '', planW: 0, planH: 0, zones: [] }
}

export async function saveSiteIrrigation(id: string, payload: { zones: IrrigationZone[]; planW?: number; planH?: number }): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/irrigation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return res.ok
}

/** Upload the rasterised plan image (PNG blob) via a signed upload URL, then save its dimensions. */
export async function uploadSiteIrrigationPlan(id: string, blob: Blob, planW: number, planH: number): Promise<boolean> {
  if (!supabase) return false
  const res = await fetch(`/api/site/projects/${id}/irrigation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'uploadUrl' }),
  })
  if (!res.ok) return false
  const { path, token } = await res.json() as { path: string; token: string }
  const up = await supabase.storage.from('project-plans').uploadToSignedUrl(path, token, blob, { contentType: 'image/png', upsert: true })
  if (up.error) return false
  return saveSiteIrrigation(id, { zones: [], planW, planH })
}

export async function deleteSiteIrrigation(id: string): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/irrigation`, { method: 'DELETE' })
  return res.ok
}

// ── Materials selection ───────────────────────────────────────────────────────
import type { SiteMaterial } from '@/lib/projectMaterials'
export type { SiteMaterial }

export async function getSiteMaterials(id: string): Promise<SiteMaterial[]> {
  const d = await getJson<{ ok: boolean; materials: SiteMaterial[] }>(`/api/site/projects/${id}/materials`)
  return d?.ok ? d.materials : []
}
export async function saveSiteMaterials(id: string, materials: SiteMaterial[]): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/materials`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materials }),
  })
  return res.ok
}

// ── Client introduction pack ──────────────────────────────────────────────────
import type { IntroPackData, IntroRoster } from '@/lib/introPack'
export type { IntroPackData, IntroRoster }

export async function getSiteIntroPack(id: string): Promise<IntroPackData> {
  const d = await getJson<{ ok: boolean; pack: IntroPackData }>(`/api/site/projects/${id}/intro`)
  return d?.pack ?? {}
}
export async function saveSiteIntroPack(id: string, data: IntroPackData): Promise<boolean> {
  const res = await fetch(`/api/site/projects/${id}/intro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
  })
  return res.ok
}
export async function getIntroRoster(): Promise<IntroRoster | null> {
  const d = await getJson<{ ok: boolean; roster: IntroRoster }>(`/api/site/intro-roster`)
  return d?.ok ? d.roster : null
}
export async function saveIntroRoster(roster: IntroRoster): Promise<boolean> {
  const res = await fetch(`/api/site/intro-roster`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roster }),
  })
  return res.ok
}
