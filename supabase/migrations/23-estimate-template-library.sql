-- Estimate template library (applied 2026-07-06): the custom item library (line items saved from
-- estimates for reuse) and full-estimate templates. jsonb-blob pattern like fg_subcontractors;
-- browser reads/writes with the anon key behind the app login, so RLS gets the same "Allow all"
-- policy as the other fg_ office tables. Both join the realtime publication for liveSync.
CREATE TABLE IF NOT EXISTS fg_library_items (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_library_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON fg_library_items FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS fg_estimate_templates (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_estimate_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON fg_estimate_templates FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE fg_library_items, fg_estimate_templates;
