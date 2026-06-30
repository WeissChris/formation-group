// Victorian public holidays — used by the Gantt to block out non-working days for scheduling.
//
// Gazetted dates per business.vic.gov.au. EDIT THIS LIST as the years roll over:
//   - the "Friday before the AFL Grand Final" is announced annually (added once gazetted; the 2026/2027
//     entries are placeholders to confirm), and
//   - substitute days apply when Christmas / Boxing Day / New Year's fall on a weekend.
// Weekend-falling holidays (e.g. Anzac Day on a Saturday) are listed for completeness but never affect
// the Mon-Fri working-day math.
//
// Map: ISO date (YYYY-MM-DD) -> holiday name.
export const VIC_PUBLIC_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': "New Year's Day",
  '2025-01-27': 'Australia Day',
  '2025-03-10': 'Labour Day',
  '2025-04-18': 'Good Friday',
  '2025-04-19': 'Easter Saturday',
  '2025-04-20': 'Easter Sunday',
  '2025-04-21': 'Easter Monday',
  '2025-04-25': 'Anzac Day',
  '2025-06-09': "King's Birthday",
  '2025-09-26': 'Friday before the AFL Grand Final',
  '2025-11-04': 'Melbourne Cup Day',
  '2025-12-25': 'Christmas Day',
  '2025-12-26': 'Boxing Day',

  // 2026
  '2026-01-01': "New Year's Day",
  '2026-01-26': 'Australia Day',
  '2026-03-09': 'Labour Day',
  '2026-04-03': 'Good Friday',
  '2026-04-04': 'Easter Saturday',
  '2026-04-05': 'Easter Sunday',
  '2026-04-06': 'Easter Monday',
  '2026-04-25': 'Anzac Day',                // Saturday — VIC does not substitute
  '2026-06-08': "King's Birthday",
  // '2026-09-25': 'Friday before the AFL Grand Final',  // CONFIRM date once gazetted
  '2026-11-03': 'Melbourne Cup Day',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Boxing Day',               // Saturday
  '2026-12-28': 'Boxing Day (additional)',  // Monday substitute

  // 2027
  '2027-01-01': "New Year's Day",
  '2027-01-26': 'Australia Day',
  '2027-03-08': 'Labour Day',
  '2027-03-26': 'Good Friday',
  '2027-03-27': 'Easter Saturday',
  '2027-03-28': 'Easter Sunday',
  '2027-03-29': 'Easter Monday',
  '2027-04-25': 'Anzac Day',                // Sunday — VIC does not substitute
  '2027-06-14': "King's Birthday",
  // '2027-10-01': 'Friday before the AFL Grand Final',  // CONFIRM date once gazetted
  '2027-11-02': 'Melbourne Cup Day',
  '2027-12-25': 'Christmas Day',            // Saturday
  '2027-12-27': 'Christmas Day (additional)', // Monday substitute
  '2027-12-28': 'Boxing Day (additional)',  // Tuesday substitute
}

/** True if the ISO date (YYYY-MM-DD) is a Victorian public holiday. */
export function isVicPublicHoliday(iso: string): boolean {
  return !!iso && iso in VIC_PUBLIC_HOLIDAYS
}

/** The holiday name for an ISO date, or undefined if it isn't one. */
export function vicPublicHolidayName(iso: string): string | undefined {
  return VIC_PUBLIC_HOLIDAYS[iso]
}

/**
 * Count Victorian public holidays that fall on a WEEKDAY (Mon-Fri) within an inclusive ISO range.
 * Used to exclude them from working-day / labour math (weekend-falling holidays are already excluded by
 * the Mon-Fri filter, so they must not be double-counted here).
 */
export function vicHolidayWeekdaysBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0
  let count = 0
  for (const iso of Object.keys(VIC_PUBLIC_HOLIDAYS)) {
    if (iso < startIso || iso > endIso) continue
    const dow = new Date(`${iso}T00:00:00`).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}
