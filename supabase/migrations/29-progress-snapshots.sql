-- Periodic read-only progress snapshots per project, appended (never overwritten) on each invoice
-- send plus a safety-net cadence. Each records where timeline/cost/labour stood at that moment vs the
-- frozen original baseline, so the foreman report can plot creep over time without anyone collecting
-- it by hand. One row per project holding the timestamped list; app is password-gated so anon writes.
CREATE TABLE IF NOT EXISTS fg_progress_snapshots (
  project_id  TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  snapshots   JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_progress_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON fg_progress_snapshots;
CREATE POLICY "Allow all" ON fg_progress_snapshots FOR ALL TO public USING (true) WITH CHECK (true);
