-- Safety First embedded: SWMS / SSSP / toolbox / incidents (applied 2026-07-02).
--
-- Phase 3 of the HazardCo replacement. SWMS + SSSP CONTENT templates live as static JSON in
-- the repo (lib/safetyContent - versioned with the code, no seeding drift); these tables hold
-- the per-project INSTANCES and field records. Server-first compliance records: service-role
-- API routes only (RLS enabled, no policies).

-- A project's SWMS: instantiated from a template (same SWMS, different project), content
-- snapshot kept on the row so later template edits never rewrite history.
CREATE TABLE IF NOT EXISTS sf_swms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  template_key  TEXT,
  activity_name TEXT NOT NULL,
  content       JSONB NOT NULL DEFAULT '{}',   -- { high_risk_categories, hazards, ppe, tasks, _meta }
  status        TEXT NOT NULL DEFAULT 'active',   -- active | superseded | archived
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_swms_project ON sf_swms(project_id);

-- Who has read + accepted a SWMS (in-app acknowledgement: typed name on the foreman's device).
CREATE TABLE IF NOT EXISTS sf_swms_acks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  swms_id      UUID NOT NULL REFERENCES sf_swms(id) ON DELETE CASCADE,
  person_name  TEXT NOT NULL,
  company      TEXT,
  phone        TEXT,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_swms_acks_swms ON sf_swms_acks(swms_id);

-- Site-specific safety plan: versioned questionnaire answers against a schema in the repo.
CREATE TABLE IF NOT EXISTS sf_sssps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  version     INT NOT NULL,
  schema_key  TEXT NOT NULL,          -- 'formation' | 'lume' (lib/safetyContent SSSP_SCHEMAS)
  answers     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS sf_toolbox_meetings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  notes       TEXT,
  attendees   JSONB NOT NULL DEFAULT '[]',   -- [{name, company}]
  held_by     TEXT,                          -- supervisor name
  held_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_toolbox_project ON sf_toolbox_meetings(project_id, held_at DESC);

CREATE TABLE IF NOT EXISTS sf_incidents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  occurred_at        TIMESTAMPTZ NOT NULL,
  location           TEXT,
  description        TEXT NOT NULL,
  people             JSONB NOT NULL DEFAULT '[]',   -- [{name, company, injury}]
  severity           TEXT NOT NULL DEFAULT 'minor', -- near_miss | minor | serious | critical
  notifiable         BOOLEAN NOT NULL DEFAULT false, -- WorkSafe notifiable (s38 OHS Act)
  worksafe_notified  BOOLEAN NOT NULL DEFAULT false,
  actions_taken      TEXT,
  reported_by        TEXT,
  status             TEXT NOT NULL DEFAULT 'open',  -- open | closed
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_incidents_project ON sf_incidents(project_id, occurred_at DESC);

ALTER TABLE sf_swms ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_swms_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_sssps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_toolbox_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_incidents ENABLE ROW LEVEL SECURITY;
