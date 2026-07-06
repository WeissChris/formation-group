-- OPC scope-of-works snippet library (applied 2026-07-07): reusable client-facing prose blocks
-- inserted into OPC scope boxes via dropdown. jsonb-blob pattern; anon-key access behind the app
-- login like the other fg_ office tables; realtime for liveSync.
CREATE TABLE IF NOT EXISTS fg_opc_snippets (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fg_opc_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON fg_opc_snippets FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE fg_opc_snippets;
