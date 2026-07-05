-- Pre-handover walkthrough ("Zero-Defect Handover" / Blue Tape audit) (applied 2026-07-03).
--
-- One row per project: the foreman's checklist state (per-item done/note/stamp, the
-- subcontractor-tasks and plant-replacement free tables) as a jsonb blob - the checklist
-- CONTENT lives in the repo (lib/handoverChecklist.ts) so wording updates version with the
-- code. Sign-off is explicit columns for reporting. Service-role only.
CREATE TABLE IF NOT EXISTS fg_handover_checklists (
  project_id     TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  data           JSONB NOT NULL DEFAULT '{}',
  signed_off_by  TEXT,
  signed_off_at  TIMESTAMPTZ,
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_handover_checklists ENABLE ROW LEVEL SECURITY;
