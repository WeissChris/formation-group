-- Gantt baselines sync (applied 2026-07-02).
--
-- Baselines were localStorage-only (fg_gantt_baselines_<projectId>), so the foreman dashboard's
-- "categories running late" card had no reference schedule server-side. One row per project holds
-- the same timestamped baselines list the office gantt keeps locally; the office upserts on "Set
-- baseline", the cockpit reads the latest to compute per-category slip. Service-role only.
CREATE TABLE IF NOT EXISTS fg_gantt_baselines (
  project_id  TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  baselines   JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_gantt_baselines ENABLE ROW LEVEL SECURITY;
