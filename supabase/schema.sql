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
  created_at TIMESTAMPTZ DEFAULT now()
);

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

-- Enable Row Level Security (permissive for single user)
ALTER TABLE fg_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_gantt ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_payment_stages ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single user app)
CREATE POLICY "Allow all" ON fg_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_proposals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_estimates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_revenue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_gantt FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_actuals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fg_payment_stages FOR ALL USING (true) WITH CHECK (true);
