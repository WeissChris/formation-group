-- Proposal potential build value + expected construction (applied 2026-07-07). Both are internal
-- (never shown on the client proposal page); they feed the office design list and the Master
-- Programme's design-pipeline tier. potential_build_value already existed on the type + UI but was
-- localStorage-only (mapProposal/upsert skipped it) - now it round-trips through Supabase too.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS potential_build_value NUMERIC;
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS expected_construction TEXT;
