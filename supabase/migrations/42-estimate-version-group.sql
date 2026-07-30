-- The version-family link (v1/v2/v3 of one quote) existed only in the app type and localStorage -
-- it was never persisted, so any sync refresh silently dropped it and families split apart on the
-- estimates list. (Applied 2026-07-30 via MCP; 43-45 were data repairs + re-touches, see git log.)
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS version_group_id TEXT;
