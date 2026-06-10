-- ── PROPOSAL PHASES ─────────────────────────────────────────────────────────
--
-- Design proposals used to have fixed phase1/2/3 fee+scope columns with hardcoded titles,
-- descriptions and outcomes. They now carry a variable-length, editable `phases` array
-- (title, scope, description, outcome, fee per phase; add/remove). This array is the source of
-- truth; the legacy phase1_fee/phase1_scope..phase3_fee/phase3_scope columns are kept in sync
-- from the first three phases for backward compatibility (older readers, the DesignProject mirror).
--
-- Read everywhere via getProposalPhases() (lib/proposalPhases.ts), which derives the array from
-- the legacy columns when `phases` is empty — so existing/already-sent proposals are unchanged.
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS phases JSONB DEFAULT '[]';
