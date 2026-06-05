-- ============================================================================
-- Ange Colins booking site — database schema
--
-- Run this once against your Supabase project (SQL Editor → paste → Run, or via
-- `supabase db push`). The app talks to this table using the service role key
-- from server-side API routes only.
-- ============================================================================

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  service_id       text        not null,
  service_name     text        not null,
  duration_minutes integer     not null,
  price_cents      integer     not null default 0,
  booking_date     date        not null,
  start_time       time        not null,
  end_time         time        not null,
  customer_name    text        not null,
  customer_email   text        not null,
  customer_phone   text        not null default '',
  notes            text        not null default '',
  status           text        not null default 'confirmed'
                     check (status in ('confirmed', 'cancelled')),
  created_at       timestamptz not null default now()
);

-- Fast lookups of "what's already booked on this day" (drives availability).
create index if not exists bookings_date_idx
  on public.bookings (booking_date);

-- Row Level Security: lock the table down. The app uses the service role key,
-- which bypasses RLS, so no public policies are needed. This prevents anyone
-- with the anon/publishable key from reading customers' contact details.
alter table public.bookings enable row level security;

-- (Intentionally no policies — only the service role may read/write.)
