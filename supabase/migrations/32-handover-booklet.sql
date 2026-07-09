-- The per-project client handover booklet content (editable prose: welcome, materials, care guides,
-- warranty, zone schedule, suppliers). The marked-up irrigation plan lives in fg_handover_irrigation;
-- this is just the words around it. Session-gated /api/site route via the service role, RLS on with
-- no anon policy (mirrors fg_handover_checklists / fg_project_materials).
CREATE TABLE IF NOT EXISTS fg_handover_booklet (
  project_id  TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_handover_booklet ENABLE ROW LEVEL SECURITY;
