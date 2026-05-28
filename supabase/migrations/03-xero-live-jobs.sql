-- ── XERO LIVE JOB DATA ──────────────────────────────────────────────────────
--
-- See docs/xero-live-job-data.md for the full design.
--
-- This migration adds the schema for the Xero cost feed + project snapshots.
-- Idempotent (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). Safe to run multiple times.
--
-- Prereqs:
--   1. supabase/schema.sql applied (fg_projects exists)
--   2. SUPABASE_SERVICE_ROLE_KEY set on Vercel (the puller uses it; anon cannot reach these tables)
--   3. fg_xero_tokens populated (Xero connected via /settings)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Per-project target GP %. Replaces the previous global 40% assumption.
-- NULL = legacy row, fall back to 40% in code.
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS target_margin_pct NUMERIC;

-- 2) Mapping from internal project to Xero tracking category value.
-- One row per project that has been mapped. Unmapped projects show a warning in the UI
-- and contribute no Xero costs.
CREATE TABLE IF NOT EXISTS fg_project_xero_mapping (
  project_id            TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  tracking_category_id  TEXT NOT NULL,    -- Xero TrackingCategory UUID
  tracking_option_id    TEXT NOT NULL,    -- Xero TrackingOption UUID (THIS project's value)
  tracking_option_name  TEXT NOT NULL,    -- denormalised display name ("Clifton St")
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Cached cost rollup. Refreshed by the puller. UI reads from here, never from Xero direct.
-- IMPORTANT: only direct-cost (COGS) accounts land here. Operating expenses / overheads /
-- director comp are filtered out at the puller, NEVER stored. Enforces the GP-only guardrail.
CREATE TABLE IF NOT EXISTS fg_xero_project_costs (
  id                BIGSERIAL PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  account_code      TEXT NOT NULL,        -- Xero account code
  account_name      TEXT NOT NULL,        -- denormalised at write time
  amount_ex_gst     NUMERIC NOT NULL,     -- cumulative spend on this account for this project
  bill_count        INTEGER NOT NULL,     -- so UI can show "based on 14 bills"
  last_bill_date    DATE,                 -- most recent transaction date in this rollup
  pulled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, account_code)
);
CREATE INDEX IF NOT EXISTS idx_fg_xero_project_costs_project ON fg_xero_project_costs(project_id);

-- 4) Per-account forecast override. The "Forecast final" column from Andrew's spreadsheets.
-- NULL forecast_final = derived value (MAX(actual, budget)) used.
CREATE TABLE IF NOT EXISTS fg_project_cost_forecast (
  project_id        TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  account_code      TEXT NOT NULL,
  forecast_final    NUMERIC,              -- NULL = use derived value
  comment           TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, account_code)
);

-- 5) Month-end snapshots — append-only. Enables fade tracking ("forecast GP was 38% in
-- Jan, 35% in Feb …"). One row per project per month-end.
CREATE TABLE IF NOT EXISTS fg_project_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  snapshot_date       DATE NOT NULL,      -- always end-of-month (or manual "snapshot now" date)
  forecast_revenue    NUMERIC NOT NULL,
  invoiced_to_date    NUMERIC NOT NULL,
  cost_to_date        NUMERIC NOT NULL,
  forecast_final_cost NUMERIC NOT NULL,
  forecast_gp_dollars NUMERIC NOT NULL,
  forecast_gp_pct     NUMERIC NOT NULL,
  quoted_margin_pct   NUMERIC,
  target_margin_pct   NUMERIC,            -- per-project target at snapshot time
  status              TEXT NOT NULL,      -- 'on_target' | 'watch' | 'below_target'
  cost_by_account     JSONB NOT NULL,     -- frozen {account_code: amount} map at snapshot time
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_fg_project_snapshots_project_date ON fg_project_snapshots(project_id, snapshot_date DESC);

-- 6) Pull-run log so the dashboard can show "last synced 14 min ago / 47 bills processed".
CREATE TABLE IF NOT EXISTS fg_xero_pull_runs (
  id                BIGSERIAL PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  trigger           TEXT NOT NULL,         -- 'cron_hourly' | 'manual' | 'cron_month_end'
  status            TEXT NOT NULL,         -- 'running' | 'ok' | 'error'
  bills_processed   INTEGER,
  projects_updated  INTEGER,
  error_message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_fg_xero_pull_runs_started ON fg_xero_pull_runs(started_at DESC);

-- ── RLS — service-role only ─────────────────────────────────────────────────
-- These five tables hold either privileged Xero data or are accessed by the puller using
-- the service role key. The anon role has NO policies, so RLS denies all anon access.
-- Authenticated user reads go through API routes that authorise the request server-side
-- and use the service-role client for the actual SELECT (or, after the Supabase Auth
-- migration in 02-rls-lockdown.sql, we could grant authenticated SELECT on the read-only
-- tables — punt that decision until lockdown is live).

ALTER TABLE fg_project_xero_mapping  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_xero_project_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_project_cost_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_project_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_xero_pull_runs        ENABLE ROW LEVEL SECURITY;
-- No policies created → service role bypasses RLS as usual, anon/authenticated get nothing.
