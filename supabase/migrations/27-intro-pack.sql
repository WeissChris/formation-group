-- Client Introduction Pack (applied 2026-07-07). fg_intro_roster: the company-wide "Meet the team"
-- roster + manager contacts, edited once and pulled into every pack (single 'default' row). Anon
-- access behind the app login like other fg_ tables. fg_intro_packs: per-project editable overrides
-- + auto-filled client/date fields (service-role only, reached via the session-gated /api/site route).
CREATE TABLE IF NOT EXISTS fg_intro_roster (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_intro_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON fg_intro_roster FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS fg_intro_packs (
  project_id   TEXT PRIMARY KEY REFERENCES fg_projects(id) ON DELETE CASCADE,
  data         JSONB NOT NULL DEFAULT '{}',
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_intro_packs ENABLE ROW LEVEL SECURITY;
