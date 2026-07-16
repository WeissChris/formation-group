-- Sample design packages shown on a design proposal (generic 2D / 3D example PDFs).
-- They are marketing collateral, not client data, and identical for every proposal - so they are
-- uploaded ONCE to a public bucket (permanent, cacheable URLs that never expire) and each proposal
-- just ticks which to show. Beats emailing 30MB or a WeTransfer link that dies after a week.
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-samples', 'proposal-samples', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- The shared library: one row per sample.
CREATE TABLE IF NOT EXISTS fg_proposal_samples (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  blurb       TEXT,
  path        TEXT NOT NULL,
  file_name   TEXT,
  size_bytes  BIGINT,
  sort        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_proposal_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON fg_proposal_samples;
CREATE POLICY "Allow all" ON fg_proposal_samples FOR ALL TO public USING (true) WITH CHECK (true);

-- Which samples this proposal shows (array of fg_proposal_samples ids).
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS sample_ids JSONB;
