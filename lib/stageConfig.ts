import type { Project, ProjectStage } from '@/types'

export const STAGE_LABELS: Record<ProjectStage, string> = {
  design: 'Design',
  estimating: 'Estimating',
  contracted: 'Contracted',
  pre_start: 'Pre-Start',
  active: 'Active',
  completion: 'Completion',
  handover: 'Handover',
}

export const STAGE_ORDER: ProjectStage[] = [
  'design', 'estimating', 'contracted', 'pre_start', 'active', 'completion', 'handover'
]

export const STAGE_COLOURS: Record<ProjectStage, string> = {
  design: 'bg-blue-100 text-blue-800',
  estimating: 'bg-purple-100 text-purple-800',
  contracted: 'bg-amber-100 text-amber-800',
  pre_start: 'bg-orange-100 text-orange-800',
  active: 'bg-green-100 text-green-800',
  completion: 'bg-teal-100 text-teal-800',
  handover: 'bg-gray-100 text-gray-700',
}

export const STAGE_CHECKLISTS: Record<ProjectStage, string[]> = {
  design: [],
  estimating: [
    'Final design received',
    'Estimate completed',
    'Margin meets target (≥40%)',
  ],
  contracted: [
    'Contract signed',
    'Deposit received',
  ],
  pre_start: [
    'Program drafted',
    'Team allocated',
    'Budget locked',
  ],
  active: [
    'Job commenced',
    'Weekly tracking active',
    'Variations being captured',
  ],
  completion: [
    'Works complete',
    'QA completed',
  ],
  handover: [
    'Client walkthrough completed',
    'Client sign-off completed',
  ],
}

export const PROGRESSION_WARNINGS: Partial<Record<ProjectStage, { checks: string[]; message: string }>> = {
  contracted: {
    checks: ['Margin meets target (≥40%)'],
    message: 'Margin check not complete. Continue to Contracted?',
  },
  pre_start: {
    checks: ['Contract signed', 'Deposit received'],
    message: 'Contract or deposit not confirmed. Continue to Pre-Start?',
  },
  active: {
    checks: ['Budget locked'],
    message: 'Budget not locked. Continue to Active?',
  },
}

export function buildChecklist(stage: ProjectStage): { id: string; label: string; completed: boolean }[] {
  return STAGE_CHECKLISTS[stage].map((label, i) => ({
    id: `${stage}-${i}`,
    label,
    completed: false,
  }))
}

export function defaultStageForStatus(status: string): ProjectStage {
  if (status === 'active') return 'active'
  if (status === 'complete' || status === 'invoiced') return 'completion'
  return 'estimating'
}

// Stages where a job is committed and in-flight — past the design/estimating pipeline, not yet a closed
// record. The "active jobs" surfaces (dashboard, programme, reports, live-jobs table) key off this rather
// than the coarse `status` field, which lags: a job can be on site at stage 'active' while status is
// still 'planning'. A finished job (status complete/invoiced) drops off regardless of stage.
export const LIVE_STAGES: ProjectStage[] = ['contracted', 'pre_start', 'active', 'completion', 'handover']

export function isLiveProject(p: Pick<Project, 'stage' | 'status'>): boolean {
  if (p.status === 'complete' || p.status === 'invoiced') return false
  if (p.stage) return LIVE_STAGES.includes(p.stage)
  return p.status === 'active'   // legacy projects with no stage set
}
