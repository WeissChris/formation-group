-- Safety First embedded: foundation schema (applied 2026-07-02).
--
-- Phase 2 of the HazardCo replacement: safety features live IN formation-group (the separate
-- safety-first app is being retired). Site -> Projects model: one physical address = one sf_site
-- with one QR; multiple fg_projects (Formation and/or Lume) can point at it via
-- fg_projects.safety_site_id, so concurrent jobs share a board + sign-in register - the thing
-- HazardCo cannot do.
--
-- Server-first: these are compliance records. All access via service-role API routes
-- (like fg_xero_*); RLS enabled with no policies = anon/authenticated denied.

CREATE TABLE IF NOT EXISTS sf_sites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_ref    TEXT NOT NULL UNIQUE,          -- "FORM-2026-001" - goes in the QR URL
  entity       TEXT NOT NULL DEFAULT 'formation',  -- 'formation' | 'lume' (board branding)
  address      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',     -- active | completed | archived
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One board per site: the printable 600x900 "Notice about building work". Every line editable.
CREATE TABLE IF NOT EXISTS sf_site_boards (
  site_id                       UUID PRIMARY KEY REFERENCES sf_sites(id) ON DELETE CASCADE,
  principal_contractor          TEXT,
  principal_contractor_number   TEXT,
  building_surveyor             TEXT,   -- name, contact number and registration number (one board line)
  building_registration_number  TEXT,
  building_permit               TEXT,   -- permit number / date of issue
  supervisor_name_number        TEXT,
  hs_manager_name_number        TEXT,
  first_aider                   TEXT,
  first_aid_contact             TEXT,
  first_aid_location            TEXT,
  fire_equipment_location       TEXT,
  emergency_signal              TEXT,
  assembly_area                 TEXT,
  nearest_medical               TEXT,
  -- Current site hazards checklist: [{label, control, checked}] - seeded with the standard list.
  hazards                       JSONB NOT NULL DEFAULT '[]',
  hazards_reviewed_on           DATE,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- QR sign-in register. No-login flow: identity = name + phone (+ remember-me cookie client-side).
CREATE TABLE IF NOT EXISTS sf_site_visits (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id       UUID NOT NULL REFERENCES sf_sites(id) ON DELETE CASCADE,
  person_name   TEXT NOT NULL,
  company       TEXT,
  phone         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'worker',   -- worker | visitor
  signed_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_out_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sf_site_visits_site ON sf_site_visits(site_id, signed_in_at DESC);

-- Site induction acceptances: first visit requires accepting the site induction; later sign-ins
-- reference it. One per person (by phone) per site.
CREATE TABLE IF NOT EXISTS sf_inductions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id      UUID NOT NULL REFERENCES sf_sites(id) ON DELETE CASCADE,
  person_name  TEXT NOT NULL,
  company      TEXT,
  phone        TEXT NOT NULL,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, phone)
);

-- Link projects to their safety site (nullable - projects without a safety site are fine).
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS safety_site_id UUID REFERENCES sf_sites(id) ON DELETE SET NULL;

ALTER TABLE sf_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_site_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_inductions ENABLE ROW LEVEL SECURITY;
