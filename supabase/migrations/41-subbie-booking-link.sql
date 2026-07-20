-- Link a schedule scope to the actual subcontractor company (applied 2026-07-20).
--
-- fg_subbie_bookings is keyed by (project_id, gantt category) because the due dates are derived
-- live from the schedule. The Subbies tab, meanwhile, lists fg_subcontractors packages keyed by
-- company/trade. The two lists never joined, so the foreman could see "Concrete is booked" but not
-- which company, and could open a subbie without seeing when they are due on site.
--
-- subbie_id is the explicit join the foreman sets once (a trade/category name match is used as the
-- suggestion, but a stored link always wins).
ALTER TABLE fg_subbie_bookings ADD COLUMN IF NOT EXISTS subbie_id TEXT;
