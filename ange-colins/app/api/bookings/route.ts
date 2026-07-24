import { NextResponse } from "next/server";
import { createBooking, SlotTakenError } from "@/lib/bookingStore";
import { getService } from "@/lib/config";
import { availableSlots } from "@/lib/slots";
import { getBookingsForDate } from "@/lib/bookingStore";

export const dynamic = "force-dynamic";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// POST /api/bookings — create a booking from the public site.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const serviceId = String(body.serviceId ?? "");
  const bookingDate = String(body.bookingDate ?? "");
  const startTime = String(body.startTime ?? "");
  const customerName = String(body.customerName ?? "").trim();
  const customerEmail = String(body.customerEmail ?? "").trim();
  const customerPhone = String(body.customerPhone ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  // Validate.
  const service = getService(serviceId);
  const errors: string[] = [];
  if (!service) errors.push("Please choose a valid service.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) errors.push("Please choose a date.");
  if (!/^\d{2}:\d{2}$/.test(startTime)) errors.push("Please choose a time.");
  if (customerName.length < 2) errors.push("Please enter your name.");
  if (!isEmail(customerEmail)) errors.push("Please enter a valid email address.");
  if (errors.length) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  // Confirm the chosen slot is genuinely offered (open hours, not in the past, free).
  try {
    const dayBookings = await getBookingsForDate(bookingDate);
    const slots = availableSlots(bookingDate, service!.durationMinutes, dayBookings);
    if (!slots.includes(startTime)) {
      return NextResponse.json(
        { error: "That time is no longer available. Please pick another slot." },
        { status: 409 },
      );
    }

    const booking = await createBooking({
      serviceId,
      bookingDate,
      startTime,
      customerName,
      customerEmail,
      customerPhone,
      notes,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the booking." },
      { status: 500 },
    );
  }
}
