-- Safety First embedded: subcontractor compliance (applied 2026-07-02).
--
-- Phase 4 of the HazardCo replacement: master contractor companies, their compliance documents
-- (WorkCover, public liability, ...), tokenised public upload links, and the chase-notification
-- dedupe table. Includes from day one the three schema pieces the old safety-first app coded
-- against but never migrated (upload tokens, notifications-sent, chase snooze).
-- Service-role only (RLS, no policies). Files live in the private `safety-prequal` bucket.

CREATE TABLE IF NOT EXISTS sf_contractor_companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  abn                 TEXT,
  email               TEXT,
  phone               TEXT,
  notes               TEXT,
  chase_snoozed_until TIMESTAMPTZ,        -- mute auto-chasing until this date
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_prequal_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES sf_contractor_companies(id) ON DELETE CASCADE,
  doc_type       TEXT NOT NULL,           -- public_liability | workers_comp | white_card | trade_licence | swms | other
  filename       TEXT NOT NULL,
  storage_path   TEXT NOT NULL,           -- safety-prequal bucket path
  issued_on      DATE,
  expires_on     DATE,
  policy_number  TEXT,
  source         TEXT NOT NULL DEFAULT 'upload',   -- upload | office
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_prequal_company ON sf_prequal_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_sf_prequal_expiry ON sf_prequal_documents(expires_on);

-- One-shot-ish public upload links (valid 14 days, reusable within that window so a subbie can
-- upload several documents from one email).
CREATE TABLE IF NOT EXISTS sf_upload_tokens (
  token       TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES sf_contractor_companies(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chase dedupe: one notification per (document, threshold, channel, recipient) - a renewed doc
-- is a new document row, so renewals re-arm naturally.
CREATE TABLE IF NOT EXISTS sf_expiry_notifications_sent (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  UUID NOT NULL REFERENCES sf_prequal_documents(id) ON DELETE CASCADE,
  threshold_days INT NOT NULL,            -- 30 | 14 | 7 | 0 | -7
  channel      TEXT NOT NULL,             -- contractor_email | office_email
  recipient    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, threshold_days, channel, recipient)
);

-- Link a project subbie package to its master company (set from the office contractors page).
ALTER TABLE fg_subcontractors ADD COLUMN IF NOT EXISTS safety_company_id UUID REFERENCES sf_contractor_companies(id) ON DELETE SET NULL;

ALTER TABLE sf_contractor_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_prequal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_expiry_notifications_sent ENABLE ROW LEVEL SECURITY;
