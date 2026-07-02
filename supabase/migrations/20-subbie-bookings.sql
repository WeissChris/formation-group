-- Foreman subbie contact/booking tracker (applied 2026-07-02).
--
-- The gantt supplies the DUE date (a category's subcontractor scope start); this table holds
-- the foreman's state per (project, category): booked-in tick + a comment ("pushed to Thursday",
-- "waiting on callback"). Rows are created lazily on first tick/comment - the list itself is
-- derived live from the gantt so schedule changes move the due dates automatically.
CREATE TABLE IF NOT EXISTS fg_subbie_bookings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES fg_projects(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  booked      BOOLEAN NOT NULL DEFAULT false,
  comment     TEXT NOT NULL DEFAULT '',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, category)
);
CREATE INDEX IF NOT EXISTS idx_fg_subbie_bookings_project ON fg_subbie_bookings(project_id);

ALTER TABLE fg_subbie_bookings ENABLE ROW LEVEL SECURITY;
