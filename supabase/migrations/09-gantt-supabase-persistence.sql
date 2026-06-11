-- Gantt persistence to Supabase (applied 2026-06-11).
--
-- The Gantt was the one internal dataset that reached Supabase nowhere: saveGanttEntries is
-- localStorage-only, there is no per-record upsert, and it isn't in the login bulk-sync. So the
-- schedule + budgeted cost/revenue + forecast-completion lived only in the browser. storageAsync
-- now has upsertGanttEntries (used by the Gantt page's Save / Build-timeline / Generate-forecast)
-- which replaces a project's fg_gantt rows. GanttEntry.subtasks needs a column for that:
ALTER TABLE fg_gantt ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]';

-- Note: fg_revenue.scheduled_cost already exists (the weekly cost model). upsertRevenue and
-- mapRevenue were updated to write/read it (it had been silently dropped on every round-trip).
