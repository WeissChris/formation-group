// Safety First (embedded) - shared types + pure helpers for the sf_ tables.
// Server routes and client pages both import from here; keep it dependency-light and testable.

export interface SafetySite {
  id: string
  shortRef: string
  entity: 'formation' | 'lume'
  address: string
  status: 'active' | 'completed' | 'archived'
  notes?: string
  createdAt?: string
}

export interface BoardHazard {
  label: string
  control: string
  checked: boolean
}

export interface SiteBoard {
  siteId: string
  principalContractor: string
  principalContractorNumber: string
  buildingSurveyor: string
  buildingRegistrationNumber: string
  buildingPermit: string
  supervisorNameNumber: string
  hsManagerNameNumber: string
  firstAider: string
  firstAidContact: string
  firstAidLocation: string
  fireEquipmentLocation: string
  emergencySignal: string
  assemblyArea: string
  nearestMedical: string
  hazards: BoardHazard[]
  hazardsReviewedOn: string
  updatedAt?: string
}

export interface SiteVisit {
  id: number
  siteId: string
  personName: string
  company: string
  phone: string
  role: 'worker' | 'visitor'
  signedInAt: string
  signedOutAt: string | null
}

export interface SiteInduction {
  id: number
  siteId: string
  personName: string
  company: string
  phone: string
  acceptedAt: string
}

/** The standard "Current Site Hazards" checklist (mirrors the HazardCo board line-for-line).
 *  Every site board starts with this; lines can be ticked/edited per site. */
export const DEFAULT_BOARD_HAZARDS: BoardHazard[] = [
  { label: 'Airborne contaminants', control: 'Keep clear / Use extraction or dampening methods / Wear PPE', checked: false },
  { label: 'Excavations', control: 'Fence off / Cover holes / Only competent workers to carry out works', checked: false },
  { label: 'Falls from height', control: 'Use correct fall protection / Secure tools & objects from falling', checked: false },
  { label: 'Hazardous Substances / Dangerous Goods', control: 'Identify & control as per SDS / Wear PPE', checked: false },
  { label: 'Ladders', control: 'Short duration work / Fit for purpose / Good condition', checked: false },
  { label: 'Noise', control: 'Keep clear of source / Wear hearing protection', checked: false },
  { label: 'Power / Hand tools & Leads', control: "Competent users only / Inspect prior to use / Tag & test RCD's", checked: false },
  { label: 'Scaffolding / Edge protection / Work platforms', control: "Authorised & competent users only / If unsafe don't use", checked: false },
  { label: 'Slips, trips & falls', control: 'Keep site tidy & walkways clear / Use bins / Fence off or cover holes', checked: false },
  { label: 'Underground / Overhead utilities', control: 'Locate & mark before you dig / Maintain a safe distance', checked: false },
  { label: 'Vehicles / Heavy machinery', control: 'Licensed operators only / Stay visible to the operator', checked: false },
]

export const ENTITY_LABEL: Record<'formation' | 'lume', string> = {
  formation: 'Formation Landscapes Pty Ltd',
  lume: 'Lume Pools Pty Ltd',
}

/** "0412 345 678" / "+61412345678" / "(03) 9xxx" -> a stable digits-only key for identity matching. */
export function normalisePhone(raw: string): string {
  const digits = (raw || '').replace(/\D+/g, '')
  if (digits.startsWith('61') && digits.length === 11) return `0${digits.slice(2)}`
  return digits
}

/** Next short ref for an entity: FORM-2026-003 / LUME-2026-001 (count-based; per-year). */
export function nextShortRef(entity: 'formation' | 'lume', year: number, existingCount: number): string {
  const prefix = entity === 'lume' ? 'LUME' : 'FORM'
  return `${prefix}-${year}-${String(existingCount + 1).padStart(3, '0')}`
}

// ── Row mappers (snake_case DB rows -> camelCase objects) ────────────────────────

export function mapSafetySite(row: Record<string, unknown>): SafetySite {
  return {
    id: row.id as string,
    shortRef: row.short_ref as string,
    entity: (row.entity as 'formation' | 'lume') || 'formation',
    address: (row.address as string) || '',
    status: (row.status as SafetySite['status']) || 'active',
    notes: (row.notes as string | null) || undefined,
    createdAt: row.created_at as string | undefined,
  }
}

export function mapSiteBoard(row: Record<string, unknown>): SiteBoard {
  return {
    siteId: row.site_id as string,
    principalContractor: (row.principal_contractor as string | null) || '',
    principalContractorNumber: (row.principal_contractor_number as string | null) || '',
    buildingSurveyor: (row.building_surveyor as string | null) || '',
    buildingRegistrationNumber: (row.building_registration_number as string | null) || '',
    buildingPermit: (row.building_permit as string | null) || '',
    supervisorNameNumber: (row.supervisor_name_number as string | null) || '',
    hsManagerNameNumber: (row.hs_manager_name_number as string | null) || '',
    firstAider: (row.first_aider as string | null) || '',
    firstAidContact: (row.first_aid_contact as string | null) || '',
    firstAidLocation: (row.first_aid_location as string | null) || '',
    fireEquipmentLocation: (row.fire_equipment_location as string | null) || '',
    emergencySignal: (row.emergency_signal as string | null) || '',
    assemblyArea: (row.assembly_area as string | null) || '',
    nearestMedical: (row.nearest_medical as string | null) || '',
    hazards: Array.isArray(row.hazards) ? (row.hazards as BoardHazard[]) : [],
    hazardsReviewedOn: (row.hazards_reviewed_on as string | null) || '',
    updatedAt: row.updated_at as string | undefined,
  }
}

/** camelCase board -> snake_case update payload (only board columns; never site_id). */
export function boardToRow(b: Partial<SiteBoard>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const put = (k: string, v: unknown) => { if (v !== undefined) out[k] = v }
  put('principal_contractor', b.principalContractor)
  put('principal_contractor_number', b.principalContractorNumber)
  put('building_surveyor', b.buildingSurveyor)
  put('building_registration_number', b.buildingRegistrationNumber)
  put('building_permit', b.buildingPermit)
  put('supervisor_name_number', b.supervisorNameNumber)
  put('hs_manager_name_number', b.hsManagerNameNumber)
  put('first_aider', b.firstAider)
  put('first_aid_contact', b.firstAidContact)
  put('first_aid_location', b.firstAidLocation)
  put('fire_equipment_location', b.fireEquipmentLocation)
  put('emergency_signal', b.emergencySignal)
  put('assembly_area', b.assemblyArea)
  put('nearest_medical', b.nearestMedical)
  put('hazards', b.hazards)
  put('hazards_reviewed_on', b.hazardsReviewedOn === '' ? null : b.hazardsReviewedOn)
  return out
}

export function mapSiteVisit(row: Record<string, unknown>): SiteVisit {
  return {
    id: Number(row.id),
    siteId: row.site_id as string,
    personName: (row.person_name as string) || '',
    company: (row.company as string | null) || '',
    phone: (row.phone as string) || '',
    role: (row.role as 'worker' | 'visitor') || 'worker',
    signedInAt: row.signed_in_at as string,
    signedOutAt: (row.signed_out_at as string | null) ?? null,
  }
}

export function mapSiteInduction(row: Record<string, unknown>): SiteInduction {
  return {
    id: Number(row.id),
    siteId: row.site_id as string,
    personName: (row.person_name as string) || '',
    company: (row.company as string | null) || '',
    phone: (row.phone as string) || '',
    acceptedAt: row.accepted_at as string,
  }
}
