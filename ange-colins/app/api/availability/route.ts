import { NextResponse } from "next/server";
import { getService } from "@/lib/config";
import { availableSlots } from "@/lib/slots";
import { getBookingsForDate } from "@/lib/bookingStore";

export const dynamic = "force-dynamic";

// GET /api/availability?date=YYYY-MM-DD&serviceId=cut-style
// → { slots: ["09:00", "09:30", ...] }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || "";
  const serviceId = searchParams.get("serviceId") || "";

  const service = getService(serviceId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !service) {
    return NextResponse.json(
      { error: "A valid date and serviceId are required." },
      { status: 400 },
    );
  }

  try {
    const bookings = await getBookingsForDate(date);
    const slots = availableSlots(date, service.durationMinutes, bookings);
    return NextResponse.json({ slots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load availability." },
      { status: 500 },
    );
  }
}
