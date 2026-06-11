-- Estimate fields that the UI set but never persisted (applied 2026-06-11).
--
-- The estimate editor sets projectType, proposalId, isBaseline, variationAmount, sentAt and
-- acceptedAt, but upsertEstimate's column whitelist and mapEstimate omitted them, so they were
-- silently dropped on every Supabase round-trip:
--   - projectType  → quote exclusions printed wrong (e.g. "pool quoted separately" on a pool job)
--   - proposalId   → lost the link back to the design proposal (client name/address resolution)
--   - isBaseline   → the convert-to-project lock evaporated on other devices
--   - variationAmount / sentAt / acceptedAt → dropped
--
-- These columns + the matching write (storageAsync.upsertEstimate) and read (mapEstimate) close it.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS project_type TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS proposal_id TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT false;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS variation_amount NUMERIC;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS sent_at TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS accepted_at TEXT;
