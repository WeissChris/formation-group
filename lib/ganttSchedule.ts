// ── Gantt working-day / labour math ───────────────────────────────────────────
// Labour hours fall out of a bar's length: working days × crew × 8. The subtlety is the two views.
// In WEEKS view a bar is stored Friday-to-Friday — a W-week bar's calendar Mon–Fri count is only 5W−4
// (a 1-week bar is a single Friday = 1 day), but it MEANS W weeks of work = 5W working days. In DAYS
// view a bar spans its actual days, so the plain calendar count is already right.

/** Working days (Mon–Fri, inclusive) in an ISO date range. */
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
  return count
}

/**
 * Working days a bar represents for LABOUR. A Weeks-view bar — both ends on a Friday, a whole number of
 * weeks apart — is W weeks of work = 5W working days (NOT the Fri-to-Fri calendar count of 5W−4, which
 * understated labour ~5×). Any other shape is a Days-view / off-grid bar whose actual Mon–Fri count is
 * already correct.
 *
 * Edge: a Days-view bar drawn exactly Friday→Friday a whole number of weeks apart is read as a Weeks bar
 * (rare — multi-week spans are drawn in Weeks view). Eliminating it would need view-intent stored per
 * bar; the trade keeps existing Fri→Fri data correct with no migration.
 */
export function labourWorkingDays(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0
  const s = new Date(`${startIso}T00:00:00`)
  const e = new Date(`${endIso}T00:00:00`)
  const calDays = Math.round((e.getTime() - s.getTime()) / 86400000)
  if (s.getDay() === 5 && e.getDay() === 5 && calDays >= 0 && calDays % 7 === 0) {
    return (calDays / 7 + 1) * 5   // W weeks → 5W working days
  }
  return workingDaysBetween(startIso, endIso)
}
