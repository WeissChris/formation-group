# Ange Colins — Booking Website

A small, self-contained appointment-booking website built with **Next.js 14**,
**Tailwind CSS** and **Supabase**. Customers browse services, pick a date and an
available time, and book in under a minute. Ange manages everything from a simple
password-protected dashboard.

It lives in its own folder and is completely independent of the rest of this
repository — you can copy the `ange-colins/` directory out to its own repo at any
time.

---

## What's inside

| Route        | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `/`          | Landing page — hero, services menu, about, opening hours, contact |
| `/book`      | 4-step booking flow: service → date → time → details → confirmed  |
| `/admin`     | Password-protected dashboard to view/cancel/restore bookings      |

### How availability works
Opening hours and the service menu are defined in **`lib/config.ts`**. When a
customer picks a date, the server generates every valid start time for the chosen
service's duration, removes anything that overlaps an existing booking, hides slots
in the past, and returns what's left. Double-bookings are rejected server-side.

---

## Running it locally

```bash
cd ange-colins
npm install
npm run dev
```

Open <http://localhost:3001>.

> **It works with zero configuration.** Without Supabase keys the site runs in
> *demo mode* — bookings are stored in memory and reset when the server restarts.
> This is perfect for previewing. Add Supabase to make bookings permanent.

---

## Going live with Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor** and run
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Copy `.env.example` to `.env.local` and fill in:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
   ADMIN_PASSWORD=choose-a-strong-password
   ```

   - `NEXT_PUBLIC_SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`:
     Project Settings → API.
   - `ADMIN_PASSWORD`: the password for `/admin`. Defaults to `ange-admin` if unset
     — **change it before going live.**
4. Restart `npm run dev`. The `/admin` banner will confirm "Saving bookings to
   Supabase."

The service role key is only ever read in server-side API routes — it is never
sent to the browser.

---

## Making it Ange's

Almost everything that's business-specific is in **`lib/config.ts`**:

- `STUDIO` — name, tagline, contact details, address, timezone.
- `SERVICES` — the menu (name, description, duration, price). Add/remove freely.
- `OPENING_HOURS` — per-weekday hours; set a day to `null` to close it.
- `SLOT_STEP_MINUTES` / `BOOKING_WINDOW_DAYS` — slot spacing and how far ahead
  people can book.

Change those and the whole site — pages, booking flow and availability — updates to
match. The current content themes it as a hair & beauty studio; swap the services
and copy for any appointment-based business (consulting, therapy, tutoring, trades…).

---

## Deploying

Deploy the `ange-colins/` folder to [Vercel](https://vercel.com) (set it as the
project root). Add the same three environment variables in the Vercel project
settings. That's it.

---

## Tech notes

- **Next.js App Router** with server-side API routes under `app/api/*`.
- **No payment processing** — bookings are reservations; Ange confirms in person.
  (Stripe could be added to the booking flow later if needed.)
- **Email confirmations** are referenced in the UI but not yet wired to a provider
  — plug in Resend/SendGrid in `app/api/bookings/route.ts` after a booking is
  created.
