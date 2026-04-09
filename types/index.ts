﻿export type EntityType = 'design' | 'formation' | 'lume'

export type ProjectStage = 
  | 'design'
  | 'estimating' 
  | 'contracted'
  | 'pre_start'
  | 'active'
  | 'completion'
  | 'handover'

export interface Project {
  id: string
  entity: EntityType
  name: string
  address: string
  clientName: string
  status: 'planning' | 'active' | 'complete' | 'invoiced'
  contractValue: number
  startDate: string
  plannedCompletion: string
  foreman: string
  foremanPin?: string
  notes: string
  stage?: ProjectStage
  stageChecklist?: { id: string; label: string; completed: boolean }[]
  nextAction?: string
  invoiceModel?: 'stage_based' | 'progress_claim'
  projectType?: 'landscape_only' | 'pool_only' | 'landscape_and_pool'
  scopes?: ProjectScope[]
  // Baseline — locked at estimate conversion, never overwritten
  baseline?: ProjectBaseline
  // Live forecast — updated as project evolves
  forecastCompletion?: string   // ISO date — updated from Gantt or manually
  forecastCost?: number         // updated from actuals + committed costs
  createdAt: string
}

export interface SubcontractorPackage {
  id: string
  projectId: string
  name: string          // subcontractor company name
  trade: string         // trade / package (e.g. Excavation, Concrete, Electrical)
  approvedValue: number // original approved quote value
  variations: number    // sum of approved variations
  invoicedToDate: number
  quoteFileName?: string  // name of uploaded file
  quoteFileData?: string  // base64 data URI
  notes?: string
  createdAt: string
}

export interface ProjectBaseline {
  capturedAt: string            // ISO date when baseline was locked
  sourceEstimateId?: string     // estimate used to create baseline
  // Financial baseline
  contractValue: number         // original contract value from estimate
  costEstimate: number          // total cost from estimate line items
  grossProfit: number           // contractValue - costEstimate
  gpPercent: number             // GP% at baseline
  // Category breakdown
  categories: { name: string; revenue: number; cost: number }[]
  // Programme baseline (captured when project goes Active)
  plannedStart?: string
  plannedCompletion?: string
}

export interface ProjectScope {
  id: string
  name: string                              // 'Landscape' | 'Pool'
  entity: EntityType
  invoiceModel: 'stage_based' | 'progress_claim'
  contractValue?: number                    // scope-level contract value (optional)
}

// ── ITEM LIBRARY ─────────────────────────────────────────────────────────────

export interface LibraryItem {
  id: string
  category: string
  description: string
  type: 'Material' | 'Labour' | 'Subcontractor' | 'Equipment'
  defaultUom: string
  defaultUnitCost: number
  crewType: 'Formation' | 'Subcontractor'
  notes?: string
}

// ── ESTIMATE LINE ITEMS ────────────────────────────────────────────────────────

export interface EstimateLineItem {
  id: string
  estimateId: string
  displayOrder: string
  category: string
  description: string
  type: 'Material' | 'Labour' | 'Subcontractor' | 'Equipment'
  units: number
  uom: string
  unitCost: number
  total: number
  markupPercent: number
  revenue: number
  crewType: 'Formation' | 'Subcontractor'
  xeroCategory?: string
  notes?: string
}

// ── ESTIMATE ──────────────────────────────────────────────────────────────────

// ── FINANCIAL OPERATIONS ──────────────────────────────────────────────────────

export type VariationStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface Estimate {
  id: string
  projectId: string
  projectName: string
  name?: string
  version: number
  status: 'draft' | 'sent' | 'accepted' | 'variation' | 'declined'
  defaultMarkupFormation: number
  defaultMarkupSubcontractor: number
  lineItems: EstimateLineItem[]
  notes?: string
  categoryNotes?: Record<string, string>
  createdAt: string
  updatedAt: string
  sentAt?: string
  acceptedAt?: string
  proposalId?: string          // links back to originating design proposal
  projectType?: 'landscape_only' | 'landscape_and_pool' | 'pool_only'
  isBaseline?: boolean         // locked when estimate is converted to a project
  // Variation fields
  parentEstimateId?: string   // links to original estimate if this is a variation
  variationNumber?: number    // 1, 2, 3… for VMO-1, VMO-2 etc
  variationReason?: string    // brief description of why the variation exists
  variationAmount?: number    // net change to contract value (positive or negative)
}

// ── PROGRESS PAYMENT STAGES ───────────────────────────────────────────────────

export interface ProgressPaymentStage {
  id: string
  projectId: string
  stageNumber: string       // e.g. "1", "2.1", "2.3"
  description: string
  quotedAmount: number      // amount from payment schedule
  paidToDate: number        // amount paid so far
  status: 'pending' | 'invoiced' | 'paid'
  // Invoice fields
  invoiceId?: string        // Xero invoice ID once created
  invoicedDate?: string     // ISO date when invoice was sent
  invoiceNumber?: string    // Invoice reference number (e.g. INV-0042)
  invoicedAmount?: number   // ACTUAL amount invoiced (may differ from quotedAmount)
  overrideAmount?: number   // User-entered override if different from schedule
  invoiceDescription?: string // editable description for invoice
}

// ── MARGIN SUMMARY ────────────────────────────────────────────────────────────

export interface CategoryMargin {
  category: string
  crewType: 'Formation' | 'Subcontractor' | 'Mixed'
  totalCost: number
  totalRevenue: number
  marginPercent: number
  markupPercent: number
  meetsTarget: boolean
  targetMargin: number
}

export interface WeeklyRevenue {
  id: string
  projectId: string
  projectName: string
  entity: EntityType
  weekEnding: string
  weekNumber: number
  plannedRevenue: number
  actualInvoiced: number
  isDeposit: boolean
  scheduledCost?: number   // cost budgeted for this week from Gantt
  notes?: string
}

export interface DesignProposal {
  id: string
  clientName: string
  clientEmail?: string
  clientPhone?: string
  projectAddress: string
  status: 'draft' | 'sent' | 'pending' | 'accepted' | 'declined' | 'lost'
  archived?: boolean
  phase1Fee: number
  phase1Scope: string
  phase2Fee: number
  phase2Scope: string
  phase3Fee?: number
  phase3Scope?: string
  validUntil: string
  acceptanceToken: string
  acceptedAt?: string
  acceptedByName?: string
  introText?: string           // Personalised introduction paragraph for proposal
  notes?: string
  createdAt: string
  updatedAt?: string
  nextStep?: string           // "Follow up Thursday", "Waiting on client feedback"
  lastContactDate?: string    // ISO date string
  potentialBuildValue?: number // Estimated construction value
  contentBlocks?: ProposalContentBlock[]
  includeAboutSection?: boolean    // default true
  includeExclusions?: boolean      // default true
  includePaymentTerms?: boolean    // default true
  includeTimeline?: boolean        // default true
  invoiceStages?: ProposalInvoiceStage[]
}

export interface ProposalContentBlock {
  id: string
  type: 'video' | 'text' | 'image_url'
  content: string     // video URL, text content, or image URL
  caption?: string
  position: 'before_phases' | 'after_phases' | 'between_phase1_2' | 'between_phase2_3'
}

export interface ProposalInvoiceStage {
  id: string
  name: string          // "Phase 1 Deposit", "Phase 1 Balance", "Phase 2", "Phase 3"
  phase: 1 | 2 | 3
  percentage: number    // 50, 50, 100, 100
  amount: number        // calculated from phase fee
  status: 'not_sent' | 'sent' | 'paid'
  sentDate?: string
  paidDate?: string
  invoiceNumber?: string
  notes?: string
}

// ── GANTT ─────────────────────────────────────────────────────────────────────

export interface GanttSegment {
  id: string
  startDate: string          // ISO date (Friday in weeks view)
  endDate: string            // ISO date (Friday in weeks view)
  weekCount: number
  label?: string             // e.g. "Base prep", "Lay pavers", "Grout"
  revenueAllocation: number  // portion of category budgetedRevenue for this segment
  costAllocation: number     // portion of category budgetedCost for this segment
  // Actuals (filled in as work progresses)
  actualCost?: number
  actualRevenue?: number
}

export interface GanttSubtask {
  id: string
  label: string
  segments: GanttSegment[]
}

export interface GanttEntry {
  id: string
  projectId: string
  estimateId: string
  category: string
  crewType: 'Formation' | 'Subcontractor'
  budgetedRevenue: number    // total revenue for this category from estimate
  budgetedCost: number       // total cost for this category from estimate
  segments: GanttSegment[]   // multiple segments (work periods) per category
  subtasks?: GanttSubtask[]  // optional sub-rows under this category
  notes?: string
}

// ── DESIGN PROJECTS ───────────────────────────────────────────────────────────

export interface DesignProject {
  id: string
  proposalId: string
  clientName: string
  projectAddress: string
  entity: 'design'

  // Phase 1
  phase1Fee: number
  phase1Status: 'not_started' | 'in_progress' | 'complete' | 'invoiced' | 'paid'
  phase1StartDate?: string
  phase1DueDate?: string
  phase1CompletedDate?: string
  phase1InvoicedDate?: string
  phase1PaidDate?: string
  phase1InvoiceNumber?: string
  phase1DepositPaid: boolean
  phase1DepositDate?: string

  // Phase 2
  phase2Fee: number
  phase2Status: 'not_started' | 'in_progress' | 'complete' | 'invoiced' | 'paid'
  phase2StartDate?: string
  phase2DueDate?: string
  phase2CompletedDate?: string
  phase2InvoicedDate?: string
  phase2PaidDate?: string
  phase2InvoiceNumber?: string

  // Phase 3 (optional)
  phase3Fee?: number
  phase3Status?: 'not_started' | 'in_progress' | 'complete' | 'invoiced' | 'paid'
  phase3DueDate?: string
  phase3PaidDate?: string

  // Financial summary
  totalFee: number        // sum of all phase fees
  totalPaid: number       // sum of paid amounts
  totalOutstanding: number // totalFee - totalPaid

  notes?: string
  createdAt: string
  updatedAt: string
  acceptedAt?: string
}

// ── PROGRESS CLAIMS ───────────────────────────────────────────────────────────

export interface ProgressClaimLineItem {
  categoryId: string        // links to estimate category or variation estimate id
  description: string
  type: 'category' | 'variation'
  contractAmount: number    // total from estimate (revenue)
  claimedToDate: number     // sum of previous claims for this category
  remaining: number         // contractAmount - claimedToDate
  claimAmount: number       // THIS claim amount (user enters)
  claimPercent: number      // alternative entry method (auto-calc: claimAmount/remaining*100)
  included: boolean         // whether this line is included in the claim
}

export interface ProgressClaim {
  id: string
  projectId: string
  invoiceNumber: string
  description: string
  status: 'draft' | 'pending' | 'sent' | 'paid'
  lineItems: ProgressClaimLineItem[]
  comments: string          // visible to client
  subtotalEx: number        // sum of claim amounts
  gst: number               // subtotalEx * 0.10
  total: number             // subtotalEx + gst
  roundingAdjustment: number
  createdAt: string
  sentAt?: string
  paidAt?: string
}

// ── TAKEOFF ───────────────────────────────────────────────────────────────────

export interface TakeoffMeasurement {
  id: string
  type: 'area' | 'length' | 'count'
  points: { x: number; y: number }[]  // normalised 0-1 coords relative to image natural size
  value: number                        // calculated quantity in real units (m², lm, count)
  planId: string
  label?: string
  isDeduction?: boolean                // if true, value is subtracted from item raw qty
}

export interface TakeoffItem {
  id: string
  name: string
  quantity: number
  unit: string  // 'm2' | 'lm' | 'ea' | 'm3' | 'hour' | 'Allowance'
  measurements: TakeoffMeasurement[]
  wastagePercent: number              // default 0; finalQty = rawQty × (1 + wastage/100)
  linkedLineItemId?: string
  manualOverride?: number             // overrides rawQty (before wastage)
  layerId?: string                    // references TakeoffLayer; undefined = default layer
}

export interface TakeoffLayer {
  id: string
  name: string
  color: string    // hex, used for measurement stroke/fill tint
  visible: boolean
}

export interface TakeoffTemplateItem {
  name: string
  unit: string
  wastagePercent: number
  layerColor?: string   // resolved by name at apply time, with colour as fallback
  layerName?: string
}

export interface TakeoffTemplate {
  id: string
  name: string
  description?: string
  items: TakeoffTemplateItem[]
  createdAt: string
  builtin?: boolean
}

export interface TakeoffGroup {
  id: string
  name: string
  items: TakeoffItem[]
  collapsed: boolean
}

export interface TakeoffPlan {
  id: string
  name: string
  dataUrl: string
  scale: number        // pixels per metre (natural image pixels)
  scaleSet: boolean
  imageWidth: number   // natural pixel width
  imageHeight: number  // natural pixel height
}

export interface TakeoffData {
  estimateId: string
  plans: TakeoffPlan[]
  groups: TakeoffGroup[]
  activePlanId?: string
  layers?: TakeoffLayer[]    // optional for backward compat with older saved takeoffs
}

// ── COST ACTUALS ──────────────────────────────────────────────────────────────

export interface WeeklyActual {
  id: string
  projectId: string
  category: string
  weekEnding: string    // ISO Friday date
  supplyCost: number    // actual material/supply cost this week
  labourCost: number    // actual labour cost this week
  notes?: string
}
