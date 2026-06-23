export type EntityType = 'design' | 'formation' | 'lume'

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
  crewSize?: number          // project-wide crew size for the Gantt labour-hours model (2/3/4)
  notes: string
  stage?: ProjectStage
  stageChecklist?: { id: string; label: string; completed: boolean }[]
  nextAction?: string
  invoiceModel?: 'stage_based' | 'progress_claim'
  projectType?: 'landscape_only' | 'pool_only' | 'landscape_and_pool'
  scopes?: ProjectScope[]
  // Baseline — locked at estimate conversion, never overwritten
  baseline?: ProjectBaseline
  // Live forecast — explicit manual overrides only. By default, forecastCompletion is derived from
  // the latest Gantt segment end via `getForecastCompletion(project, ganttEntries)` in
  // `lib/projectHealth.ts`, and forecastCost is derived from gantt budgetedCost in calcProjectHealth.
  // These fields exist so a user can override the derived value if needed; if unset, derivation wins.
  /** @deprecated Prefer `getForecastCompletion(project, ganttEntries)` — only set as a manual override. */
  forecastCompletion?: string
  /** @deprecated Derived from gantt in calcProjectHealth — only set as a manual override. */
  forecastCost?: number
  /**
   * Per-project target gross margin %, e.g. 40 for landscape, 33 for subbie-heavy.
   * Drives the Live Jobs dashboard status thresholds (on_target / watch / below_target)
   * and the fade calculation (forecastGP% − targetMarginPct). NULL = fall back to 40%
   * for legacy projects created before this field existed.
   */
  targetMarginPct?: number
  createdAt: string
  /** ISO timestamp set automatically by save helpers — drives Supabase conflict resolution. */
  updatedAt?: string
}

export interface SubcontractorClaim {
  id: string
  date: string         // ISO date of the claim
  amount: number       // ex-GST amount claimed this progress claim
  reference?: string   // the subbie's invoice / claim number
  notes?: string
}

export interface SubcontractorPackage {
  id: string
  projectId: string
  name: string          // subcontractor company name
  trade: string         // trade / package (e.g. Excavation, Concrete, Electrical)
  approvedValue: number // original approved quote value
  variations: number    // sum of approved variations
  invoicedToDate: number // kept = sum(claims) when claims exist; manual entry for legacy packages
  claims?: SubcontractorClaim[]  // individual progress claims the subbie makes against the quoted total
  quoteFileName?: string  // name of uploaded quote file
  quoteFileData?: string  // base64 data URI of the quote
  notes?: string
  sourceEstimateId?: string      // set when seeded from an estimate's subcontractor lines
  sourceLineItemIds?: string[]
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
  subcategory?: string   // e.g. category "Paving" → subcategory "Front yard paving"; becomes a Gantt posting
  description: string
  type: 'Material' | 'Labour' | 'Subcontractor' | 'Equipment'
  units: number
  uom: string
  unitCost: number
  total: number
  markupPercent: number
  revenue: number
  crewType: 'Formation' | 'Subcontractor'
  enabled?: boolean      // false = turned off: kept on the estimate for reference, excluded from totals/Gantt
  quoteFileName?: string // subcontractor quote attached to this line (required before contract for Subcontractor lines)
  quoteFileData?: string // base64 data URI of the attached quote
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
  clientName?: string          // client/customer name — for standalone estimates not linked to a project/proposal
  projectAddress?: string      // site address — for standalone estimates not linked to a project/proposal
  name?: string
  version: number
  status: 'draft' | 'sent' | 'accepted' | 'variation' | 'declined'
  defaultMarkupFormation: number
  defaultMarkupSubcontractor: number
  lineItems: EstimateLineItem[]
  // Project-level markups (waste, contingency, etc. — up to 5) added as a % of COST on top of the
  // marked-up line subtotal, plus rounding of the ex-GST total. See getEstimateContract.
  projectMarkups?: { id: string; description: string; percent: number }[]
  roundingMode?: 'none' | 'ten' | 'hundred' | 'thousand'
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
  // Variation client-approval workflow (mirrors proposals)
  acceptanceToken?: string    // token for the public approval link
  sendMessage?: string        // editable cover message shown to the client + used in the send email
  acceptedByName?: string     // client name typed on approval
  declinedAt?: string
  declinedByName?: string
  archived?: boolean          // rejected variations are archived (hidden from active lists)
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
  /** ISO timestamp set automatically by save helpers — drives Supabase conflict resolution. */
  updatedAt?: string
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
  /** ISO timestamp set automatically by save helpers — drives Supabase conflict resolution. */
  updatedAt?: string
}

/**
 * One phase of a design proposal. The source-of-truth, variable-length replacement for the
 * fixed phase1/2/3 fields. Title, description and outcome are editable per proposal (they were
 * previously hardcoded in the proposal preview). Read via getProposalPhases() in
 * lib/proposalPhases.ts, which derives this array from the legacy fields for older proposals.
 */
export interface ProposalPhase {
  id: string
  title: string          // editable heading, e.g. "Concept / Schematic Design"
  fee: number
  scope: string          // deliverables (newline/sentence list)
  description?: string   // intro paragraph shown above the deliverables
  outcome?: string       // outcome paragraph shown beside the deliverables
  depositSplit?: boolean // bill 50% deposit + 50% balance (historically phase 1 only)
}

export interface DesignProposal {
  id: string
  clientName: string
  clientName2?: string         // optional second client (e.g. partner) — addressed alongside clientName
  clientEmail?: string
  clientPhone?: string
  ccEmails?: string            // extra recipients CC'd on the proposal email (comma-separated)
  projectAddress: string
  status: 'draft' | 'sent' | 'pending' | 'accepted' | 'declined' | 'lost'
  archived?: boolean
  // Variable-length phases — the source of truth when present. The phase1/2/3 fields below are
  // kept in sync from the first three phases for backward compatibility (Supabase columns, the
  // DesignProject mirror, older readers). New/edited proposals populate `phases`.
  phases?: ProposalPhase[]
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
  firstViewedAt?: string       // when the client first opened the proposal page (view tracking)
  introText?: string           // Opening paragraph shown ON the proposal page (the letter)
  emailMessage?: string        // Message in the email that delivers the proposal (separate from introText)
  programText?: string         // "Program" box near the end — how long each phase takes (editable; has a default)
  welcomeVideoUrl?: string     // Video shown under the opening letter (YouTube or Vimeo)
  processVideoUrl?: string     // Video shown under the Design Process section (YouTube or Vimeo)
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
  name: string          // "Phase 1 — Concept Design (Deposit)", "Phase 2 — …", …
  phase: number         // 1-based phase ordinal (variable number of phases)
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
  revenueAllocation: number  // portion of category budgetedRevenue for this segment (DERIVED — see below)
  costAllocation: number     // portion of category budgetedCost for this segment (DERIVED — see below)
  // Per-period resource allocation (Gantt). Labour, material, subcontractor and equipment are each a
  // manual % of their own budget for this period. costAllocation/revenueAllocation are then derived from
  // these (revenue follows progress = cost-weighted) — those remain what the forecast reads.
  materialsPct?: number      // % of the category's MATERIAL budget allocated to this period
  subPct?: number            // % of the category's SUBCONTRACTOR budget (seeded from materialsPct on first
                             // load so the legacy material+sub combined split is preserved, then editable)
  equipmentPct?: number      // % of the category's equipment budget allocated to this period
  labourPct?: number         // % of the category's LABOUR budget for this period (manual, auto-balanced
                             // to 100% across periods). Seeded from the bar-length share on first load so
                             // existing schedules are unchanged, then editable — replaces bar×crew×hours.
  labourHours?: number       // derived (display only): labour cost for this period ÷ standard rate
  // Which view the bar was drawn in, so labour reads the right working-day count. A weeks bar stored
  // Fri→Fri means whole weeks (5 days/week); a days bar means its actual Mon–Fri days. Without this a
  // 1-day bar that lands on a Friday is indistinguishable from a 1-week bar and was charged 5 days of
  // labour. Absent = 'weeks' (legacy bars were drawn in weeks view).
  grain?: 'days' | 'weeks'
  // Actuals (filled in as work progresses)
  actualCost?: number
  actualRevenue?: number
}

export interface GanttSubtask {
  id: string
  label: string
  segments: GanttSegment[]
  subtasks?: GanttSubtask[]   // nested sub-tasks (purely visual sub-scheduling; carry no budget/forecast)
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
  xeroInvoiceId?: string        // Xero InvoiceID once a draft has been pushed to Xero
  xeroInvoiceNumber?: string    // the number Xero assigned to the draft (may differ from invoiceNumber)
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
  hidden?: boolean                    // per-item show/hide — hides this item's measurements on the plan
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
  // Vector auto-measure (PDF only): material-area outlines extracted from the plan's vector content.
  autoRegions?: { code: string; points: { x: number; y: number }[] }[]
  autoScanned?: boolean   // true once an auto-scan was attempted (distinguishes "image/no scan" from "scanned, found nothing")
}

export interface TakeoffData {
  estimateId: string
  plans: TakeoffPlan[]
  groups: TakeoffGroup[]
  activePlanId?: string
  layers?: TakeoffLayer[]    // optional for backward compat with older saved takeoffs
  updatedAt?: string         // last-save stamp; lets the loader pick the freshest of localStorage vs IndexedDB
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
  /** ISO timestamp set automatically by save helpers — drives Supabase conflict resolution. */
  updatedAt?: string
}
