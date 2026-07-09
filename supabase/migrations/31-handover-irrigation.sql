-- Foreman's marked-up irrigation plan per project: the rasterised plan image lives in the
-- project-plans bucket (key <projectId>/irrigation/plan.png); this row holds its pixel dimensions
-- and the colour-coded zones drawn over it. Read/written only by the session-gated /api/site routes
-- via the service role, so RLS stays on with no anon policy (mirrors fg_handover_checklists).
CREATE TABLE IF NOT EXISTS fg_handover_irrigation (
  project_id  TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  plan_path   TEXT,
  plan_w      INTEGER,
  plan_h      INTEGER,
  zones       JSONB NOT NULL DEFAULT '[]',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_handover_irrigation ENABLE ROW LEVEL SECURITY;
