-- Opinion of Probable Cost document data (applied 2026-07-07): per-category client-facing
-- Scope of Works prose, manual Pool & Spa subtotal, editable exclusions - everything the
-- /estimates/[id]/opc print page needs beyond the estimate's own numbers.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS opc JSONB;
