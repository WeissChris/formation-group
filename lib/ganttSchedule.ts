// ── Gantt working-day / labour math ───────────────────────────────────────────
// Labour hours fall out of a bar's length: working days × crew × 8. The subtlety is the two views.
// In WEEKS view a bar is stored Friday-to-Friday — a W-week bar's calendar Mon–Fri count is only 5W−4
// (a 1-week bar is a single Friday = 1 day), but it MEANS W weeks of work = 5W working days. In DAYS
// view a bar spans its actual days, so the plain calendar count is already right.
// VIC public holidays are non-working days, same as weekends — they drop a labour day from any bar
// that spans them (see lib/publicHolidays).

import { vicHolidayWeekdaysBetween } from './publicHolidays'

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Working days (Mon–Fri, inclusive) in an ISO date range, minus any VIC public holidays in it. */
export function workingDaysBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0
  const d = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  let count = 0
  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return Math.max(0, count - vicHolidayWeekdaysBetween(startIso, endIso))
}

/**
 * Working days a bar represents for LABOUR.
 *
 * A DAYS-view bar means its literal Mon–Fri span — a single day is 1 working day. Pass grain='days' for
 * these; otherwise a 1-day bar that happens to land on a Friday is indistinguishable from a 1-week bar
 * and gets charged 5 days of labour (the bug Andrew hit).
 *
 * A WEEKS-view bar is stored Friday→Friday: both ends on a Friday a whole number of weeks apart means W
 * weeks of work = 5W working days (NOT the Fri-to-Fri calendar count of 5W−4, which understated labour
 * ~5×). This is the default (grain absent) so legacy bars — all drawn in weeks view — stay correct with
 * no migration. Any other shape falls back to the actual Mon–Fri count.
 */
export function labourWorkingDays(startIso: string, endIso: string, grain?: 'days' | 'weeks'): number {
  if (!startIso || !endIso) return 0
  if (grain === 'days') return workingDaysBetween(startIso, endIso)
  const s = new Date(`${startIso}T00:00:00`)
  const e = new Date(`${endIso}T00:00:00`)
  const calDays = Math.round((e.getTime() - s.getTime()) / 86400000)
  if (s.getDay() === 5 && e.getDay() === 5 && calDays >= 0 && calDays % 7 === 0) {
    // W weeks → 5W working days, less any public holidays across the represented Mon–Fri weeks. The bar
    // is stored Friday→Friday, so the first week's Monday is startFri − 4 days.
    const firstMonday = new Date(s); firstMonday.setDate(firstMonday.getDate() - 4)
    return Math.max(0, (calDays / 7 + 1) * 5 - vicHolidayWeekdaysBetween(toIso(firstMonday), endIso))
  }
  return workingDaysBetween(startIso, endIso)
}
