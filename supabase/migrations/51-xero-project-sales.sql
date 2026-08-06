-- Sales (ACCREC) invoices from Xero, matched to projects by tracking option - one row per
-- invoice per project. Fills the invoiced-to-date gap for jobs whose sales invoicing predates
-- the platform's progress claims (raised directly in Xero). Readers dedupe against platform
-- claims by invoice number, so an invoice raised THROUGH the platform never counts twice.
-- Service-role only (RLS on, no anon policy) - written by the sync, read by /api/xero/live-jobs.
CREATE TABLE IF NOT EXISTS fg_xero_project_sales (
  invoice_id     TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date   DATE,
  status         TEXT,
  total_ex_gst   NUMERIC NOT NULL DEFAULT 0,
  pulled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_xero_project_sales_project ON fg_xero_project_sales(project_id);
ALTER TABLE fg_xero_project_sales ENABLE ROW LEVEL SECURITY;
