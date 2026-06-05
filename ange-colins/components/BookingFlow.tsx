"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  CalendarDays,
  Loader2,
  PartyPopper,
} from "lucide-react";
import { SERVICES, getService } from "@/lib/config";
import { upcomingOpenDates } from "@/lib/slots";
import {
  cn,
  formatPrice,
  formatDuration,
  formatTime,
  formatDateLong,
} from "@/lib/utils";
import type { Booking } from "@/lib/types";

type Step = 0 | 1 | 2 | 3 | 4;
const STEP_LABELS = ["Service", "Date", "Time", "Details", "Done"];

export default function BookingFlow({
  initialServiceId,
}: {
  initialServiceId?: string;
}) {
  const [step, setStep] = useState<Step>(initialServiceId ? 1 : 0);
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [details, setDetails] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notes: "",
  });

  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const service = getService(serviceId);
  const dates = useMemo(() => upcomingOpenDates(), []);

  // Fetch availability whenever we land on the time step with a date + service.
  useEffect(() => {
    if (step !== 2 || !date || !serviceId) return;
    let active = true;
    setLoadingSlots(true);
    setError("");
    fetch(`/api/availability?date=${date}&serviceId=${serviceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setSlots(data.slots ?? []);
      })
      .catch(() => active && setError("Couldn't load times. Please try again."))
      .finally(() => active && setLoadingSlots(false));
    return () => {
      active = false;
    };
  }, [step, date, serviceId]);

  function goTo(s: Step) {
    setError("");
    setStep(s);
  }

  async function submit() {
    if (!service) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, bookingDate: date, startTime: time, ...details }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        // If the slot vanished, send them back to pick another time.
        if (res.status === 409) goTo(2);
        return;
      }
      setConfirmed(data.booking as Booking);
      setStep(4);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const detailsValid =
    details.customerName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.customerEmail.trim());

  return (
    <div className="mx-auto w-full max-w-2xl">
      {step < 4 && <Stepper step={step} />}

      <div className="mt-8 rounded-xl2 border border-line bg-white/60 p-6 sm:p-8">
        {/* Step 0 — Service */}
        {step === 0 && (
          <div>
            <StepHeading title="Choose a service" subtitle="What would you like to book?" />
            <div className="mt-6 space-y-3">
              {SERVICES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    goTo(1);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors",
                    serviceId === s.id
                      ? "border-clay bg-blush/50"
                      : "border-line bg-white/50 hover:border-clay/50 hover:bg-sand/40",
                  )}
                >
                  <div>
                    <p className="font-serif text-lg text-ink">{s.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone">
                      <Clock className="size-3.5" /> {formatDuration(s.durationMinutes)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-serif text-lg text-clay">
                    {s.priceCents === 0 ? "Free" : formatPrice(s.priceCents)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Date */}
        {step === 1 && (
          <div>
            <StepHeading
              title="Pick a date"
              subtitle={service ? `For your ${service.name.toLowerCase()}` : undefined}
            />
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {dates.map((d) => {
                const [y, m, day] = d.split("-").map(Number);
                const local = new Date(y, m - 1, day);
                const wd = local.toLocaleDateString("en-AU", { weekday: "short" });
                const monthShort = local.toLocaleDateString("en-AU", { month: "short" });
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setDate(d);
                      setTime("");
                      goTo(2);
                    }}
                    className={cn(
                      "rounded-xl border p-3 text-center transition-colors",
                      date === d
                        ? "border-clay bg-blush/50"
                        : "border-line bg-white/50 hover:border-clay/50 hover:bg-sand/40",
                    )}
                  >
                    <span className="block text-xs uppercase tracking-wide text-stone">{wd}</span>
                    <span className="mt-1 block font-serif text-2xl text-ink">{day}</span>
                    <span className="block text-xs text-stone">{monthShort}</span>
                  </button>
                );
              })}
            </div>
            <BackRow onBack={() => goTo(initialServiceId ? 0 : 0)} />
          </div>
        )}

        {/* Step 2 — Time */}
        {step === 2 && (
          <div>
            <StepHeading
              title="Choose a time"
              subtitle={date ? formatDateLong(date) : undefined}
            />
            {loadingSlots ? (
              <div className="mt-10 flex items-center justify-center gap-2 text-stone">
                <Loader2 className="size-4 animate-spin" /> Loading times…
              </div>
            ) : slots.length === 0 ? (
              <div className="mt-8 rounded-xl border border-line bg-sand/40 p-6 text-center text-sm text-stone">
                No times left on this day.{" "}
                <button onClick={() => goTo(1)} className="font-medium text-clay underline">
                  Pick another date
                </button>
                .
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {slots.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTime(t);
                      goTo(3);
                    }}
                    className={cn(
                      "rounded-xl border py-3 text-sm font-medium transition-colors",
                      time === t
                        ? "border-clay bg-blush/50 text-ink"
                        : "border-line bg-white/50 text-ink hover:border-clay/50 hover:bg-sand/40",
                    )}
                  >
                    {formatTime(t)}
                  </button>
                ))}
              </div>
            )}
            <BackRow onBack={() => goTo(1)} />
          </div>
        )}

        {/* Step 3 — Details */}
        {step === 3 && (
          <div>
            <StepHeading title="Your details" subtitle="So Ange can confirm your booking." />
            <div className="mt-6 space-y-4">
              <Field
                label="Full name"
                value={details.customerName}
                onChange={(v) => setDetails({ ...details, customerName: v })}
                placeholder="Jane Smith"
                autoFocus
              />
              <Field
                label="Email"
                type="email"
                value={details.customerEmail}
                onChange={(v) => setDetails({ ...details, customerEmail: v })}
                placeholder="jane@example.com"
              />
              <Field
                label="Phone (optional)"
                type="tel"
                value={details.customerPhone}
                onChange={(v) => setDetails({ ...details, customerPhone: v })}
                placeholder="0400 000 000"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Anything Ange should know? (optional)
                </label>
                <textarea
                  className="field min-h-[88px] resize-none"
                  value={details.notes}
                  onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                  placeholder="Allergies, inspiration, parking…"
                />
              </div>
            </div>

            <Summary serviceName={service?.name} date={date} time={time} price={service?.priceCents} />

            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button onClick={() => goTo(2)} className="btn-ghost">
                <ArrowLeft className="size-4" /> Back
              </button>
              <button onClick={submit} disabled={!detailsValid || submitting} className="btn-primary">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Booking…
                  </>
                ) : (
                  <>
                    Confirm booking <Check className="size-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Confirmation */}
        {step === 4 && confirmed && (
          <div className="py-6 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-blush text-clay">
              <PartyPopper className="size-8" />
            </span>
            <h2 className="display mt-6 text-3xl">You&apos;re booked in!</h2>
            <p className="mt-2 text-stone">
              A confirmation is on its way to {confirmed.customerEmail}.
            </p>
            <div className="mx-auto mt-7 max-w-sm rounded-xl border border-line bg-sand/40 p-5 text-left text-sm">
              <Row label="Service" value={confirmed.serviceName} />
              <Row label="When" value={`${formatDateLong(confirmed.bookingDate)}, ${formatTime(confirmed.startTime)}`} />
              <Row label="Duration" value={formatDuration(confirmed.durationMinutes)} />
              <Row
                label="Price"
                value={confirmed.priceCents === 0 ? "Complimentary" : formatPrice(confirmed.priceCents)}
              />
              <Row label="Name" value={confirmed.customerName} />
            </div>
            <Link href="/" className="btn-ghost mt-7">
              Back to home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      {STEP_LABELS.slice(0, 4).map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-xs font-medium transition-colors",
                  done && "bg-clay text-cream",
                  active && "bg-ink text-cream",
                  !done && !active && "border border-line bg-white/60 text-stone",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs sm:inline",
                  active ? "font-medium text-ink" : "text-stone",
                )}
              >
                {label}
              </span>
            </div>
            {i < 3 && <span className="h-px w-4 bg-line sm:w-8" />}
          </div>
        );
      })}
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-stone">{subtitle}</p>}
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <input
        className="field"
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Summary({
  serviceName,
  date,
  time,
  price,
}: {
  serviceName?: string;
  date: string;
  time: string;
  price?: number;
}) {
  return (
    <div className="mt-6 rounded-xl border border-line bg-sand/40 p-4">
      <p className="flex items-center gap-2 text-sm text-ink">
        <CalendarDays className="size-4 text-clay" />
        <span className="font-medium">{serviceName}</span>
        {price !== undefined && (
          <span className="text-stone">· {price === 0 ? "Complimentary" : formatPrice(price)}</span>
        )}
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-sm text-stone">
        <Clock className="size-4 text-clay" />
        {date && formatDateLong(date)} at {time && formatTime(time)}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 py-1.5 last:border-0">
      <span className="text-stone">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
