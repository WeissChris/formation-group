import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { setBookingStatus } from "@/lib/bookingStore";
import type { BookingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// PATCH /api/admin/bookings/:id  { status: "cancelled" | "confirmed" }
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let status: string;
  try {
    const body = await request.json();
    status = String(body.status ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (status !== "confirmed" && status !== "cancelled") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    await setBookingStatus(params.id, status as BookingStatus);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 500 },
    );
  }
}
