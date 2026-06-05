// Time-slot generation. All slot maths is done in plain minutes-since-midnight
// on a given calendar date, so there is no timezone ambiguity: a slot is simply
// a (date, "HH:mm") pair. "Today" and the current time are resolved in the
// studio's configured timezone so we never offer a slot that has already passed.

import {
  OPENING_HOURS,
  SLOT_STEP_MINUTES,
  BOOKING_WINDOW_DAYS,
  STUDIO,
} from "./config";
import type { Booking } from "./types";

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Current date + minutes-since-midnight in the studio timezone. */
export function nowInStudio(): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  // Intl can emit "24" for midnight under hour12:false — normalise to 00.
  const hour = get("hour") === "24" ? 0 : Number(get("hour"));
  const minutes = hour * 60 + Number(get("minute"));
  return { date, minutes };
}

/** Weekday (0=Sun..6=Sat) for a YYYY-MM-DD date, parsed as local (no TZ shift). */
function weekday(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** The next N bookable calendar dates (YYYY-MM-DD) the studio is open. */
export function upcomingOpenDates(count = BOOKING_WINDOW_DAYS): string[] {
  const { date: today } = nowInStudio();
  const [y, m, d] = today.split("-").map(Number);
  const cursor = new Date(y, m - 1, d);
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (OPENING_HOURS[cursor.getDay()]) dates.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** True if [aStart,aEnd) overlaps [bStart,bEnd). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Available start times ("HH:mm") for a service of `durationMinutes` on `dateIso`,
 * given the bookings already taken that day. Past slots (for today) are excluded.
 */
export function availableSlots(
  dateIso: string,
  durationMinutes: number,
  bookingsThatDay: Booking[],
): string[] {
  const hours = OPENING_HOURS[weekday(dateIso)];
  if (!hours) return [];

  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const now = nowInStudio();
  const isToday = dateIso === now.date;

  const taken = bookingsThatDay
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));

  const slots: string[] = [];
  for (let start = open; start + durationMinutes <= close; start += SLOT_STEP_MINUTES) {
    const end = start + durationMinutes;
    // Hide slots that have already started today (with a small buffer).
    if (isToday && start <= now.minutes + 10) continue;
    if (taken.some((t) => overlaps(start, end, t.start, t.end))) continue;
    slots.push(toHHMM(start));
  }
  return slots;
}
