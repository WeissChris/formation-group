-- Per-job labour HOURS from Xero AU Payroll timesheets (applied 2026-07-02).
--
-- The crew's timesheets are job-tagged (TimesheetLine.TrackingItemID matches the same
-- fg_project_xero_mapping tracking options the cost feed uses - proven by the payroll probe:
-- 186/187 lines carried a tracking ID). This stores REAL logged hours per project per
-- week-ending Friday, so "hours used" no longer has to be derived from labour $ / $68 (real
-- pay rates vary per staff member; the costed rate is fixed - deriving gives wrong hours).
--
-- Written by lib/xeroHoursSync.ts (replace-per-project) on the hourly cron, throttled to
-- ~daily since timesheets are entered weekly. Read server-side via service-role API routes
-- (the /site Scorecard labour lever + later the office Position tab).
CREATE TABLE IF NOT EXISTS fg_xero_project_hours (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  week_ending       DATE NOT NULL,        -- week-ending Friday (matches the revenue calendar)
  hours             NUMERIC NOT NULL DEFAULT 0,
  pulled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, week_ending)
);
CREATE INDEX IF NOT EXISTS idx_fg_xero_project_hours_project ON fg_xero_project_hours(project_id);

-- Read server-side via a service-role API route (like fg_xero_project_costs). Lock to service role.
ALTER TABLE fg_xero_project_hours ENABLE ROW LEVEL SECURITY;
