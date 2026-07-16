-- Per-category "done" ticks on an estimate ({ category: true }), so an estimator can see at a glance
-- which sections are finished and which still need work. Manual, mirroring category_notes.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS category_complete JSONB;
