-- Fix: fg_gantt_baselines was created (migration 19) with RLS enabled but NO policy, so the office
-- gantt's anon-key upsert on "Set baseline" was silently denied and no project ever got a baseline
-- row. The foreman monthly report reads this table for schedule slip, so it always said "no baseline
-- set" even after one was captured. Add the same permissive "Allow all" policy the sibling gantt
-- tables use (fg_gantt, fg_gantt_milestones) - the app is password-gated at its own layer, not via
-- Supabase auth, so anon is the write role for every fg_ table.
DROP POLICY IF EXISTS "Allow all" ON fg_gantt_baselines;
CREATE POLICY "Allow all" ON fg_gantt_baselines FOR ALL TO public USING (true) WITH CHECK (true);
