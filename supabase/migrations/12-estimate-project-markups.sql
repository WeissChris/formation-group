-- Project-level markups + rounding on the estimate (applied 2026-06-12).
--
-- A "Markup & Rounding" box (à la Buildxact): up to 5 named markup % components (waste,
-- contingency, etc.) applied ON TOP of the marked-up line subtotal, plus rounding of the ex-GST
-- total to the nearest 10/100/1000. See lib/estimateCalculations getEstimateContract — its `factor`
-- (contract ÷ line revenue) scales category budgets so the Gantt/baseline sum to the contract.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS project_markups JSONB DEFAULT '[]';
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS rounding_mode TEXT;
