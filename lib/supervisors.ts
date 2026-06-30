import type { Supervisor } from '@/types'

// Distinct, muted-but-legible swatches for new supervisors (cycled by index when seeding).
export const SUPERVISOR_PALETTE = [
  '#6BA5C8', '#C8A870', '#8AA888', '#B57F7F', '#9B8AC8',
  '#C89B6B', '#5FA89E', '#C86B9B', '#7F94B5', '#A8A85F',
]

/** Colour to show when a project has no supervisor (or one with no colour). */
export const UNASSIGNED_COLOUR = '#B8B2A8'

export function nextSupervisorColour(existing: Supervisor[]): string {
  const used = new Set(existing.map(s => s.colour))
  return SUPERVISOR_PALETTE.find(c => !used.has(c)) ?? SUPERVISOR_PALETTE[existing.length % SUPERVISOR_PALETTE.length]
}

/** Map a supervisor NAME -> colour. Projects link by `project.foreman` === Supervisor.name. */
export function supervisorColourByName(sups: Supervisor[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const s of sups) if (s.name) m[s.name] = s.colour
  return m
}
