-- Foreman variation cost breakdown: labour hours + materials cost entered on site (the foreman's
-- real inputs), priced up by the office at approval. Nullable - legacy amount-only variations
-- keep working untouched.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS variation_labour_hours NUMERIC;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS variation_materials_cost NUMERIC;
