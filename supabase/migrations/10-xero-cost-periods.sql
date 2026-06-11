-- Time-phased Xero actual cost (applied 2026-06-11).
--
-- The cumulative fg_xero_project_costs stays the authoritative GP source (one total per
-- project/account, no time dimension). This adds a SEPARATE, additive table so a cumulative
-- budget-to-date vs actual-to-date cost curve is possible:
--   - supply/subbie: weekly buckets (bills + spend-money carry dates; bucketed by week-ending
--     Friday from the same matched + cost-of-sales-filtered line items as the rollup)
--   - labour: monthly buckets (the Xero P&L report is period-summed, so one call per month;
--     bounded to the last 12 months by LABOUR_PERIOD_MONTHS in lib/xeroCostSync.ts)
-- Written in runFullSync inside a try/catch that can NEVER affect the GP rollup. GP-only: only
-- direct-cost accounts land here.
CREATE TABLE IF NOT EXISTS fg_xero_cost_periods (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  account_code      TEXT NOT NULL,
  account_name      TEXT,
  source            TEXT NOT NULL,        -- 'supply' | 'labour'
  grain             TEXT NOT NULL,        -- 'week' | 'month'
  period_end        DATE NOT NULL,        -- Friday for weekly supply; month-end for monthly labour
  amount_ex_gst     NUMERIC NOT NULL DEFAULT 0,
  pulled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, account_code, source, grain, period_end)
);
CREATE INDEX IF NOT EXISTS idx_fg_xero_cost_periods_project ON fg_xero_cost_periods(project_id);

-- Read server-side via a service-role API route (like fg_xero_project_costs). Lock to service role.
ALTER TABLE fg_xero_cost_periods ENABLE ROW LEVEL SECURITY;
