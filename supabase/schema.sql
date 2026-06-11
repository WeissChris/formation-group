-- Formation Group Database Schema
-- Run this in your Supabase project SQL Editor

-- Projects
CREATE TABLE IF NOT EXISTS fg_projects (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL DEFAULT 'formation',
  name TEXT NOT NULL,
  address TEXT,
  client_name TEXT,
  status TEXT DEFAULT 'planning',
  contract_value NUMERIC DEFAULT 0,
  start_date TEXT,
  planned_completion TEXT,
  foreman TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Design Proposals
CREATE TABLE IF NOT EXISTS fg_proposals (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_name2 TEXT,           -- optional second client (partner); see migration 07
  client_email TEXT,
  client_phone TEXT,
  project_address TEXT,
  status TEXT DEFAULT 'draft',
  phase1_fee NUMERIC DEFAULT 0,
  phase1_scope TEXT,
  phase2_fee NUMERIC DEFAULT 0,
  phase2_scope TEXT,
  phase3_fee NUMERIC DEFAULT 0,
  phase3_scope TEXT,
  phases JSONB DEFAULT '[]',   -- variable-length editable phase list (source of truth; see migration 04)
  intro_text TEXT,             -- opening paragraph shown on the proposal page
  email_message TEXT,          -- message in the delivery email (separate from intro_text)
  cc_emails TEXT,              -- extra recipients CC'd on the proposal email (comma-separated)
  welcome_video_url TEXT,      -- per-proposal custom welcome video (blank = default); see migration 06
  process_video_url TEXT,      -- per-proposal custom design-process video (blank = default); see migration 06
  valid_until TEXT,
  notes TEXT,
  acceptance_token TEXT UNIQUE,
  accepted_at TEXT,
  accepted_by_name TEXT,
  content_blocks JSONB DEFAULT '[]',
  include_about_section BOOLEAN DEFAULT true,
  include_exclusions BOOLEAN DEFAULT true,
  include_payment_terms BOOLEAN DEFAULT true,
  include_timeline BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Estimates
CREATE TABLE IF NOT EXISTS fg_estimates (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES fg_projects(id),
  project_name TEXT,
  name TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft',
  default_markup_formation NUMERIC DEFAULT 40,
  default_markup_subcontractor NUMERIC DEFAULT 35,
  line_items JSONB DEFAULT '[]',
  category_notes JSONB DEFAULT '{}',
  parent_estimate_id TEXT,
  variation_number INTEGER,
  variation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly Revenue (Revenue Calendar)
CREATE TABLE IF NOT EXISTS fg_revenue (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  project_name TEXT,
  entity TEXT,
  week_ending TEXT,
  week_number INTEGER,
  planned_revenue NUMERIC DEFAULT 0,
  actual_invoiced NUMERIC DEFAULT 0,
  scheduled_cost NUMERIC DEFAULT 0,
  is_deposit BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()  -- required by safeUpsert conflict-resolution
);
-- If you applied this schema before updated_at was added, run:
--   ALTER TABLE fg_revenue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Gantt Entries
CREATE TABLE IF NOT EXISTS fg_gantt (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES fg_projects(id),
  estimate_id TEXT,
  category TEXT,
  crew_type TEXT,
  budgeted_revenue NUMERIC DEFAULT 0,
  budgeted_cost NUMERIC DEFAULT 0,
  segments JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly Actuals (Cost Tracker)
CREATE TABLE IF NOT EXISTS fg_actuals (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES fg_projects(id),
  category TEXT,
  week_ending TEXT,
  supply_cost NUMERIC DEFAULT 0,
  labour_cost NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payment Stages
CREATE TABLE IF NOT EXISTS fg_payment_stages (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES fg_projects(id),
  stage_number TEXT,
  description TEXT,
  percent_hint NUMERIC DEFAULT 0,
  quoted_amount NUMERIC DEFAULT 0,
  claim_amount NUMERIC DEFAULT 0,
  paid_to_date NUMERIC DEFAULT 0,
  approx_date TEXT,
  status TEXT DEFAULT 'pending',
  invoice_number TEXT,
  invoiced_date TEXT,
  invoiced_amount NUMERIC,
  override_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Xero OAuth tokens — singleton row, accessed only via SUPABASE_SERVICE_ROLE_KEY (server-side).
-- The `id = 'singleton'` check ensures only one row ever exists. RLS is enabled with NO public
-- policy, which means the anon key cannot read or write tokens; only the service role can.
-- Note: requires SUPABASE_SERVICE_ROLE_KEY env var on the server. Without it the Xero integration
-- gracefully degrades to "not configured" rather than falling back to the old client-side storage.
CREATE TABLE IF NOT EXISTS fg_xero_tokens (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 'singleton')
);
ALTER TABLE fg_xero_tokens ENABLE ROW LEVEL SECURITY;
-- NO POLICY — that's the point. Service role bypasses RLS; anon role has no access.

-- Enable Row Level Security (permissive for single user)
ALTER TABLE fg_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_gantt ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_payment_stages ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single user app) — WIDE OPEN to anyone with the published anon key.
-- This is the known gap flagged in the CTO audit. Replace with role-based or auth.uid()-scoped
-- policies once the auth-to-RLS bridge is in place.
--
-- See `supabase/migrations/02-rls-lockdown.sql` for the lockdown migration. Run it AFTER
-- NEXT_PUBLIC_AUTH_PROVIDER=supabase is the active flow — running it before will deny
-- every write and lock you out.
CREATE POLICY "Allow all" ON fg_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_proposals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_estimates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_revenue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_gantt FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_actuals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_payment_stages FOR ALL USING (true) WITH CHECK (true);
