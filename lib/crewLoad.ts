// Crew load - scheduled labour hours per week from the gantt vs crew capacity. Answers "is
// the forward programme physically deliverable, and when do we run light?". Labour hours
// live on labour-discipline claim segments (entered in hours in the allocation modal);
// untyped leaves default to labour, same as the revenue maths (entryClaimSegments rules).

import type { GanttEntry } from '@/types'
import { claimLeafSegments, segmentWeekShare } from './ganttForecast'
import { snapToFriday, toISODate } from './utils'

export const HOURS_PER_PERSON_WEEK = 40   // matches the estimate labour checker

export interface CrewLoadWeek {
  friIso: string
  scheduledHours: number
  capacityHours: number
  /** scheduled / capacity as %, null when capacity unknown. */
  loadPct: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function computeCrewLoad(
  entries: GanttEntry[],
  crewSize: number,               // total people across active crews
  todayIso: string,
  weeks = 8,
): CrewLoadWeek[] {
  const start = snapToFriday(new Date(`${todayIso.slice(0, 10)}T00:00:00`))
  const capacity = crewSize > 0 ? crewSize * HOURS_PER_PERSON_WEEK : 0

  // Labour leaves only: costType labour, or untyped (defaults to labour).
  const labourSegs = entries.flatMap(e =>
    claimLeafSegments(e.subtasks ?? []).filter(l => l.costType === 'labour').map(l => l.seg))

  const out: CrewLoadWeek[] = []
  for (let i = 0; i < weeks; i++) {
    const fri = new Date(start); fri.setDate(fri.getDate() + i * 7)
    const friIso = toISODate(fri)
    const mon = new Date(fri); mon.setDate(mon.getDate() - 4)
    const monIso = toISODate(mon)
    let hours = 0
    for (const seg of labourSegs) {
      const share = segmentWeekShare(seg, monIso, friIso)
      if (share > 0) hours += (seg.labourHours || 0) * share
    }
    out.push({
      friIso,
      scheduledHours: round1(hours),
      capacityHours: capacity,
      loadPct: capacity > 0 ? round1((hours / capacity) * 100) : null,
    })
  }
  return out
}
