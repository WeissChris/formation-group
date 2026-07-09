-- Foreman materials selection per project: what material, where it's sourced, the allowance, and
-- whether it's confirmed. One blob per project, read/written only by the session-gated /api/site
-- routes via the service role, so RLS stays on with no anon policy (mirrors fg_handover_checklists).
CREATE TABLE IF NOT EXISTS fg_project_materials (
  project_id  TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  materials   JSONB NOT NULL DEFAULT '[]',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_project_materials ENABLE ROW LEVEL SECURITY;
