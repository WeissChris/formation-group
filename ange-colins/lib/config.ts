// ============================================================================
// SINGLE SOURCE OF TRUTH FOR ANGE'S BUSINESS
//
// Everything that's specific to Ange's business lives here. To rebrand the site
// for a different kind of service (consulting, therapy, tutoring, trades, etc.)
// you only need to edit this file — change the studio name, the services, and
// the opening hours, and the whole site + booking flow updates to match.
// ============================================================================

import type { Service } from "./types";

export const STUDIO = {
  name: "Ange Colins",
  tagline: "Hair & Beauty Studio",
  blurb:
    "A calm, considered studio where every appointment is unhurried and personal. Ange brings fifteen years of experience to colour, cuts and care — book a time that suits you.",
  // Business timezone — used to work out "today" and hide past time slots.
  timezone: "Australia/Sydney",
  email: "hello@angecolins.com.au",
  phone: "0400 000 000",
  address: "Studio 4, 128 Maple Street, Sydney NSW",
  instagram: "@angecolins",
} as const;

// The service menu. Customers pick one of these when booking.
// durationMinutes drives how time slots are generated.
export const SERVICES: Service[] = [
  {
    id: "consultation",
    name: "Consultation",
    description:
      "A relaxed 20-minute chat to talk through what you're after, with no obligation to book further.",
    durationMinutes: 20,
    priceCents: 0,
  },
  {
    id: "cut-style",
    name: "Cut & Style",
    description:
      "A precision cut tailored to you, finished with a blow-dry and styling.",
    durationMinutes: 60,
    priceCents: 9500,
  },
  {
    id: "colour",
    name: "Colour & Gloss",
    description:
      "Full colour or refresh with a glossing treatment for shine and tone.",
    durationMinutes: 120,
    priceCents: 18500,
  },
  {
    id: "treatment",
    name: "Signature Treatment",
    description:
      "A restorative scalp and hair treatment with a relaxing head massage.",
    durationMinutes: 45,
    priceCents: 7000,
  },
  {
    id: "occasion",
    name: "Special Occasion",
    description:
      "Styling for weddings, events and milestones. Looking your absolute best.",
    durationMinutes: 90,
    priceCents: 14000,
  },
];

// Opening hours by weekday (0 = Sunday … 6 = Saturday).
// `null` means closed that day. Times are 24h "HH:mm" in the studio timezone.
// `slotStep` controls how far apart the offered start times are (minutes).
export const OPENING_HOURS: Record<
  number,
  { open: string; close: string } | null
> = {
  0: null, // Sunday — closed
  1: null, // Monday — closed
  2: { open: "09:00", close: "18:00" }, // Tuesday
  3: { open: "09:00", close: "18:00" }, // Wednesday
  4: { open: "09:00", close: "20:00" }, // Thursday (late night)
  5: { open: "09:00", close: "18:00" }, // Friday
  6: { open: "09:00", close: "15:00" }, // Saturday
};

export const SLOT_STEP_MINUTES = 30;

// How many days ahead customers can book.
export const BOOKING_WINDOW_DAYS = 30;

export function getService(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}
