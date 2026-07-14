// Proposal phases — the single source of truth for a design proposal's phases.
//
// Proposals used to have fixed phase1/2/3 fields with hardcoded titles, descriptions and
// outcomes. They now carry a variable-length `phases` array (editable title/scope/description/
// outcome/fee, add/remove). `getProposalPhases` derives that array from the legacy fields for
// any proposal that predates the change, so existing — including already-sent — proposals render
// byte-identically to before. Every place that reads phases should go through this module.

import type { DesignProposal, ProposalPhase } from '@/types'

// Default design-revision allowance for a new proposal, and the note that sits under it. Editable
// per proposal. "Revisions" here = rounds of client-requested changes to the design within a phase.
export const DEFAULT_REVISIONS_INCLUDED = 2
export const DEFAULT_REVISIONS_NOTE =
  'Each design phase includes the number of revision rounds shown above, allowing us to refine the ' +
  'design in response to your feedback. Additional revisions beyond these are charged at our standard ' +
  'hourly design rate, always quoted and agreed with you before any further work is undertaken.'

/** Client-facing one-liner for the revision allowance, e.g. "2 rounds of design revisions are included". */
export function revisionsSummary(n: number): string {
  return `${n} round${n === 1 ? '' : 's'} of design revisions ${n === 1 ? 'is' : 'are'} included in the design fees.`
}

// Default copy for the "Program" box near the end of the proposal — how long each phase takes.
// Editable per proposal via proposal.programText; this renders when that's blank.
export const DEFAULT_PROGRAM_TEXT = `Upon acceptance of this proposal and receipt of the engagement fee, we will schedule your project to commence.

Phase 1 (Concept Design): Approximately 6 weeks
Phase 2 (Design Development): Commences following concept approval (3 weeks)
I will be in touch as the concept design nears completion to arrange a presentation meeting.`

// Historic hardcoded copy, lifted verbatim from the old ProposalPreview so derived (legacy)
// proposals are unchanged.
export const DEFAULT_PHASE_TITLES = [
  'Concept / Schematic Design',
  'Design Development',
  'Administration',
]

export const DEFAULT_PHASE_DESCRIPTIONS = [
  'This stage focuses on establishing the overall vision and spatial layout of the project. We explore how the landscape will function, how key elements are positioned, and how the space will feel.',
  'During this stage, the concept is refined and resolved into a fully considered design. We work through how each element comes together, finalising layouts, levels, materials, and key selections.',
  'This stage translates the resolved design into detailed construction drawings and specifications. These documents provide clear instruction for construction, ensuring all elements are built accurately and consistently.',
]

export const DEFAULT_PHASE_OUTCOMES = [
  'A clear and cohesive design direction that defines the layout, functionality, and overall aesthetic of the project.',
  'A resolved and coordinated design with all key elements, materials, and levels clearly defined and ready for construction documentation.',
  'A comprehensive set of drawings and documentation that enables the project to be accurately priced and constructed without ambiguity.',
]

/** Default description/outcome for the phase at ordinal index i (falls back to the last entry). */
export function defaultPhaseDescription(i: number): string {
  return DEFAULT_PHASE_DESCRIPTIONS[i] ?? DEFAULT_PHASE_DESCRIPTIONS[DEFAULT_PHASE_DESCRIPTIONS.length - 1]
}
export function defaultPhaseOutcome(i: number): string {
  return DEFAULT_PHASE_OUTCOMES[i] ?? DEFAULT_PHASE_OUTCOMES[DEFAULT_PHASE_OUTCOMES.length - 1]
}

/**
 * The variable-length phase list for a proposal. Returns the explicit `phases` array when the
 * proposal has one; otherwise derives it from the legacy phase1/2/3 fields plus the historic
 * default titles/descriptions/outcomes. An empty array (e.g. the Supabase '[]' default) counts
 * as "no explicit phases" and derives from the legacy fields.
 */
export function getProposalPhases(p: DesignProposal): ProposalPhase[] {
  if (p.phases && p.phases.length > 0) return p.phases
  const phases: ProposalPhase[] = [
    {
      id: 'p1', title: DEFAULT_PHASE_TITLES[0], fee: p.phase1Fee, scope: p.phase1Scope,
      description: DEFAULT_PHASE_DESCRIPTIONS[0], outcome: DEFAULT_PHASE_OUTCOMES[0], depositSplit: true,
    },
    {
      id: 'p2', title: DEFAULT_PHASE_TITLES[1], fee: p.phase2Fee, scope: p.phase2Scope,
      description: DEFAULT_PHASE_DESCRIPTIONS[1], outcome: DEFAULT_PHASE_OUTCOMES[1],
    },
  ]
  if (p.phase3Fee != null && p.phase3Fee > 0) {
    phases.push({
      id: 'p3', title: DEFAULT_PHASE_TITLES[2], fee: p.phase3Fee, scope: p.phase3Scope ?? '',
      description: DEFAULT_PHASE_DESCRIPTIONS[2], outcome: DEFAULT_PHASE_OUTCOMES[2],
    })
  }
  return phases
}

/** Sum of phase fees (ex GST). */
export function phasesTotal(phases: ProposalPhase[]): number {
  return phases.reduce((s, ph) => s + (ph.fee || 0), 0)
}

/**
 * Return a proposal with `phases` set AND the legacy phase1/2/3 columns synced from the first
 * three phases, so the Supabase columns, the DesignProject mirror and any legacy reader stay
 * correct. Phases beyond the third live only in `phases` (read everywhere via getProposalPhases).
 */
export function syncLegacyPhaseFields(p: DesignProposal, phases: ProposalPhase[]): DesignProposal {
  return {
    ...p,
    phases,
    phase1Fee: phases[0]?.fee ?? 0,
    phase1Scope: phases[0]?.scope ?? '',
    phase2Fee: phases[1]?.fee ?? 0,
    phase2Scope: phases[1]?.scope ?? '',
    phase3Fee: phases[2]?.fee,
    phase3Scope: phases[2]?.scope,
  }
}

/** A fresh blank phase for the "Add phase" action. `ordinal` is 1-based for the default title. */
export function makeBlankPhase(ordinal: number): ProposalPhase {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `phase-${ordinal}-${Date.now()}`,
    title: `Phase ${ordinal}`,
    fee: 0,
    scope: '',
    description: '',
    outcome: '',
  }
}
