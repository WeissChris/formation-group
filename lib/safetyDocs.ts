// Safety docs (SWMS / SSSP / toolbox / incidents) - shared types + row mappers.
// Content templates live in lib/safetyContent; these are the per-project instances.

import type { SwmsTemplate } from './safetyContent'

export interface Swms {
  id: string
  projectId: string
  templateKey: string | null
  activityName: string
  content: Pick<SwmsTemplate, 'high_risk_categories' | 'hazards' | 'ppe' | 'tasks' | '_meta'>
  status: 'active' | 'superseded' | 'archived'
  createdAt: string
  updatedAt?: string
}

export interface SwmsAck {
  id: number
  swmsId: string
  personName: string
  company: string
  phone: string
  acceptedAt: string
}

export interface Sssp {
  id: string
  projectId: string
  version: number
  schemaKey: 'formation' | 'lume'
  answers: Record<string, unknown>
  createdAt: string
}

export interface ToolboxMeeting {
  id: string
  projectId: string
  topic: string
  notes: string
  attendees: { name: string; company?: string }[]
  heldBy: string
  heldAt: string
}

export type IncidentSeverity = 'near_miss' | 'minor' | 'serious' | 'critical'

export interface Incident {
  id: string
  projectId: string
  occurredAt: string
  location: string
  description: string
  people: { name: string; company?: string; injury?: string }[]
  severity: IncidentSeverity
  notifiable: boolean
  worksafeNotified: boolean
  actionsTaken: string
  reportedBy: string
  status: 'open' | 'closed'
  createdAt: string
}

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  near_miss: 'Near miss', minor: 'Minor', serious: 'Serious', critical: 'Critical',
}

/** WorkSafe Vic notifiable-incident hints (s38 OHS Act 2004) shown on the incident form. */
export const NOTIFIABLE_HINTS = [
  'A death',
  'An injury needing medical treatment within 48 hours of exposure to a substance',
  'An injury needing immediate treatment as an in-patient in hospital',
  'Immediate treatment for: amputation, serious head/eye injury, electric shock, serious laceration, de-gloving/scalping, spinal injury, loss of bodily function',
  'A dangerous incident (collapse, explosion, fire, uncontrolled escape of gas/steam/substance, fall from 2m+ of a person or object)',
]

export function mapSwms(row: Record<string, unknown>): Swms {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    templateKey: (row.template_key as string | null) ?? null,
    activityName: (row.activity_name as string) || '',
    content: (row.content as Swms['content']) || { high_risk_categories: [], hazards: [], ppe: [], tasks: [] },
    status: (row.status as Swms['status']) || 'active',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
  }
}

export function mapSwmsAck(row: Record<string, unknown>): SwmsAck {
  return {
    id: Number(row.id),
    swmsId: row.swms_id as string,
    personName: (row.person_name as string) || '',
    company: (row.company as string | null) || '',
    phone: (row.phone as string | null) || '',
    acceptedAt: row.accepted_at as string,
  }
}

export function mapSssp(row: Record<string, unknown>): Sssp {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    version: Number(row.version) || 1,
    schemaKey: (row.schema_key as 'formation' | 'lume') || 'formation',
    answers: (row.answers as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
  }
}

export function mapToolbox(row: Record<string, unknown>): ToolboxMeeting {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    topic: (row.topic as string) || '',
    notes: (row.notes as string | null) || '',
    attendees: Array.isArray(row.attendees) ? (row.attendees as ToolboxMeeting['attendees']) : [],
    heldBy: (row.held_by as string | null) || '',
    heldAt: row.held_at as string,
  }
}

export function mapIncident(row: Record<string, unknown>): Incident {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    occurredAt: row.occurred_at as string,
    location: (row.location as string | null) || '',
    description: (row.description as string) || '',
    people: Array.isArray(row.people) ? (row.people as Incident['people']) : [],
    severity: (row.severity as IncidentSeverity) || 'minor',
    notifiable: !!row.notifiable,
    worksafeNotified: !!row.worksafe_notified,
    actionsTaken: (row.actions_taken as string | null) || '',
    reportedBy: (row.reported_by as string | null) || '',
    status: (row.status as 'open' | 'closed') || 'open',
    createdAt: row.created_at as string,
  }
}
