-- Per-category classification on an estimate: 'upgrade' (optional extra the client can add) or
-- 'value_management' (a saving option). Flagged categories are priced like any other but sit
-- OUTSIDE the contract totals / gantt / BOQ until the flag is cleared (client accepts), and they
-- feed the OPC's Upgrades / Value Management sections automatically. Absent key = normal scope.
-- (Applied 2026-07-31 via MCP.)
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS category_kind JSONB NOT NULL DEFAULT '{}';
