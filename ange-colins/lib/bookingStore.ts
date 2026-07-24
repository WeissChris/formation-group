// The booking store. One interface, two backends:
//
//   • Supabase  — when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
//                 bookings persist in the `bookings` table (see supabase/migrations).
//   • In-memory — otherwise, a module-level array so the site is fully usable for a
//                 demo. Data resets when the server restarts.
//
// All callers go through these functions and never touch Supabase directly.

import { getSupabaseAdmin } from "./supabase";
import { getService } from "./config";
import { toMinutes, toHHMM } from "./slots";
import type { Booking, NewBookingInput } from "./types";

const TABLE = "bookings";

// ---- In-memory fallback --------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __angeBookings: Booking[] | undefined;
}
// Persist across hot reloads in dev.
const memory: Booking[] = (globalThis.__angeBookings ??= []);

function makeId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `bk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

// ---- Row <-> domain mapping (Supabase) -----------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToBooking(r: any): Booking {
  return {
    id: r.id,
    serviceId: r.service_id,
    serviceName: r.service_name,
    durationMinutes: r.duration_minutes,
    priceCents: r.price_cents,
    bookingDate: r.booking_date,
    startTime: (r.start_time as string).slice(0, 5),
    endTime: (r.end_time as string).slice(0, 5),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone ?? "",
    notes: r.notes ?? "",
    status: r.status,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Public API ----------------------------------------------------------

export async function getBookingsForDate(dateIso: string): Promise<Booking[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return memory.filter((b) => b.bookingDate === dateIso);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("booking_date", dateIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToBooking);
}

export async function listBookings(): Promise<Booking[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...memory].sort((a, b) =>
      `${a.bookingDate}${a.startTime}`.localeCompare(`${b.bookingDate}${b.startTime}`),
    );
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToBooking);
}

export class SlotTakenError extends Error {
  constructor() {
    super("That time has just been taken. Please choose another slot.");
    this.name = "SlotTakenError";
  }
}

export async function createBooking(input: NewBookingInput): Promise<Booking> {
  const service = getService(input.serviceId);
  if (!service) throw new Error("Unknown service.");

  const startMin = toMinutes(input.startTime);
  const endTime = toHHMM(startMin + service.durationMinutes);

  // Guard against double-booking (best-effort; in-memory and Supabase both checked).
  const sameDay = await getBookingsForDate(input.bookingDate);
  const clash = sameDay.some((b) => {
    if (b.status === "cancelled") return false;
    const bStart = toMinutes(b.startTime);
    const bEnd = toMinutes(b.endTime);
    return startMin < bEnd && bStart < startMin + service.durationMinutes;
  });
  if (clash) throw new SlotTakenError();

  const booking: Booking = {
    id: makeId(),
    serviceId: service.id,
    serviceName: service.name,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    bookingDate: input.bookingDate,
    startTime: input.startTime,
    endTime,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim(),
    customerPhone: (input.customerPhone ?? "").trim(),
    notes: (input.notes ?? "").trim(),
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    memory.push(booking);
    return booking;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      id: booking.id,
      service_id: booking.serviceId,
      service_name: booking.serviceName,
      duration_minutes: booking.durationMinutes,
      price_cents: booking.priceCents,
      booking_date: booking.bookingDate,
      start_time: booking.startTime,
      end_time: booking.endTime,
      customer_name: booking.customerName,
      customer_email: booking.customerEmail,
      customer_phone: booking.customerPhone,
      notes: booking.notes,
      status: booking.status,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToBooking(data);
}

export async function setBookingStatus(
  id: string,
  status: Booking["status"],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const b = memory.find((x) => x.id === id);
    if (b) b.status = status;
    return;
  }
  const { error } = await supabase.from(TABLE).update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}
