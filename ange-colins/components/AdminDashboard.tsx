"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  Mail,
  Phone,
  StickyNote,
  X,
  RotateCcw,
  LogOut,
  Database,
  HardDrive,
} from "lucide-react";
import type { Booking } from "@/lib/types";
import {
  cn,
  formatPrice,
  formatTime,
  formatDateLong,
  formatDuration,
} from "@/lib/utils";

export default function AdminDashboard({
  initialBookings,
  supabaseConfigured,
}: {
  initialBookings: Booking[];
  supabaseConfigured: boolean;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [filter, setFilter] = useState<"upcoming" | "all" | "cancelled">("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);

  const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (local)

  const visible = useMemo(() => {
    return bookings.filter((b) => {
      if (filter === "cancelled") return b.status === "cancelled";
      if (filter === "upcoming") {
        return b.status !== "cancelled" && b.bookingDate >= todayIso;
      }
      return true;
    });
  }, [bookings, filter, todayIso]);

  const stats = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    const upcoming = active.filter((b) => b.bookingDate >= todayIso);
    const revenue = upcoming.reduce((sum, b) => sum + b.priceCents, 0);
    return { upcoming: upcoming.length, total: active.length, revenue };
  }, [bookings, todayIso]);

  async function setStatus(id: string, status: Booking["status"]) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex flex-col leading-none">
            <span className="font-serif text-xl text-ink">Bookings</span>
            <span className="text-[0.6rem] uppercase tracking-wide2 text-stone">
              Ange Colins · Studio
            </span>
          </div>
          <button onClick={logout} className="btn-ghost px-4 py-2 text-sm">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </header>

      <div className="container-page py-8">
        {/* Storage notice */}
        <div
          className={cn(
            "mb-6 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
            supabaseConfigured
              ? "border-line bg-white/60 text-stone"
              : "border-clay/40 bg-blush/40 text-clay-dark",
          )}
        >
          {supabaseConfigured ? (
            <>
              <Database className="size-4" /> Saving bookings to Supabase.
            </>
          ) : (
            <>
              <HardDrive className="size-4" /> Demo mode — bookings are kept in memory
              and reset when the server restarts. Add Supabase keys to persist them.
            </>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Upcoming" value={String(stats.upcoming)} />
          <Stat label="All-time bookings" value={String(stats.total)} />
          <Stat label="Upcoming revenue" value={formatPrice(stats.revenue)} />
        </div>

        {/* Filters */}
        <div className="mt-8 flex gap-2">
          {(["upcoming", "all", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm capitalize transition-colors",
                filter === f
                  ? "bg-ink text-cream"
                  : "border border-line bg-white/50 text-stone hover:bg-sand/50",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="mt-5 space-y-3">
          {visible.length === 0 && (
            <p className="rounded-xl border border-line bg-white/50 p-8 text-center text-sm text-stone">
              No {filter} bookings.
            </p>
          )}
          {visible.map((b) => (
            <div
              key={b.id}
              className={cn(
                "rounded-xl2 border bg-white/60 p-5",
                b.status === "cancelled" ? "border-line/60 opacity-60" : "border-line",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-serif text-lg text-ink">{b.serviceName}</p>
                    {b.status === "cancelled" && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        Cancelled
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-4 text-clay" />
                      {formatDateLong(b.bookingDate)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-4 text-clay" />
                      {formatTime(b.startTime)} · {formatDuration(b.durationMinutes)}
                    </span>
                  </p>
                </div>
                <span className="font-serif text-lg text-clay">
                  {b.priceCents === 0 ? "Free" : formatPrice(b.priceCents)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
                <div className="space-y-1 text-sm text-stone">
                  <p className="font-medium text-ink">{b.customerName}</p>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <a href={`mailto:${b.customerEmail}`} className="flex items-center gap-1.5 hover:text-ink">
                      <Mail className="size-3.5" /> {b.customerEmail}
                    </a>
                    {b.customerPhone && (
                      <a href={`tel:${b.customerPhone}`} className="flex items-center gap-1.5 hover:text-ink">
                        <Phone className="size-3.5" /> {b.customerPhone}
                      </a>
                    )}
                  </p>
                  {b.notes && (
                    <p className="flex items-start gap-1.5 text-stone">
                      <StickyNote className="mt-0.5 size-3.5 shrink-0" /> {b.notes}
                    </p>
                  )}
                </div>

                {b.status === "cancelled" ? (
                  <button
                    onClick={() => setStatus(b.id, "confirmed")}
                    disabled={busyId === b.id}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    <RotateCcw className="size-4" /> Restore
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus(b.id, "cancelled")}
                    disabled={busyId === b.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    <X className="size-4" /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl2 border border-line bg-white/60 p-5">
      <p className="text-xs uppercase tracking-wide2 text-stone">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}
