-- Company-wide care-guide library for handover booklets: a single shared row so wording edits flow
-- to every booklet (per-job pruning lives on the booklet's excludedCareIds). Mirrors fg_intro_roster.
-- Any authenticated /api/site session may read/write it via the service role; RLS on, no anon policy.
CREATE TABLE IF NOT EXISTS fg_care_guide_library (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_care_guide_library ENABLE ROW LEVEL SECURITY;
