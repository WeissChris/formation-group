# Formation Group — project guide for Claude

Ops / quoting / scheduling web app for Formation Landscapes (Chris Weiss). This file is the
context a fresh session needs; read it first.

## Product vision
The site is intended to manage the **entire customer cycle** — from the initial design
proposal, through quoting and project setup, to a finished construction project. Treat new
work as building toward that single end-to-end flow (design proposal -> estimate/quote ->
accepted -> scheduling/gantt + revenue forecast -> construction delivery -> completion), and
keep the stages joined up rather than as isolated tools.

## Stack & repo
- Next.js 14 (App Router), React 18, TypeScript, Tailwind 3, Vitest. Windows dev machine.
- GitHub: https://github.com/WeissChris/formation-group (branch `main`).
- Supabase backend (project `ffqthmmhnvkkcjypigie`, shared with the Lume app). Internal UI
  reads localStorage; Supabase is sync/backup + the public-surface source.
- Env vars live in `.env.local` (NOT committed): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_PASSWORD`, `NEXT_PUBLIC_AUTH_PROVIDER`,
  `NEXT_PUBLIC_DEFAULT_EMAIL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_XERO_*`. You do NOT need
  them to edit / verify / push — only to run `npm run dev`. Get them from Vercel if needed.

## How we work
- **Deploy is automatic on push to `main`** (Vercel). No separate deploy step.
- **Always verify before pushing**, all three must pass:
  - `npm run typecheck` (tsc --noEmit)
  - `npm run test` (vitest run — keep it green; ~294 tests as of this writing)
  - `npm run build` (next build)
- Once green, commit and push to `main` directly — no need to ask first. End commit messages
  with a `Co-Authored-By: Claude <noreply@anthropic.com>` line.
- Conventions: **Australian English; NO em-dashes or en-dashes** (use a hyphen or rewrite);
  **ASCII only** in code/comments; match the surrounding code (it's dense and terse — keep it).
- **You cannot screenshot the running app** — the page's realtime websocket blocks the
  screenshot tool. Verify logic with build + tests; rely on Chris to eyeball the live deploy.
  When he reports a visual bug he'll usually attach a screenshot.
- Never reproduce GP-only / financial rules incorrectly; this app is GP-based, not markup.

## The Gantt & Revenue Schedule feature (the active work area)
- Main file: `app/projects/[id]/gantt/page.tsx` (~2700 lines — whole UI + logic).
- Pure, unit-tested libs (reuse, don't re-implement in the page):
  - `lib/ganttForecast.ts` — `claimLeafSegments` / `entryClaimSegments` / `plannedByWeek`
  - `lib/ganttSubtasks.ts` — subtask-tree helpers (map / find / remove / add / flatten)
  - `lib/ganttAllocation.ts` — per-period % allocation (normalize / rebalance)
  - `lib/ganttSchedule.ts` — working-day / labour math
  Each has a matching `*.test.ts`.

### Model — read before touching the forecast
- A category can be **split** into Materials / Labour / Subcontractor "type lines" (subtasks
  carrying a `costType`). Splitting **clears the category's own segments** — its claims then
  live on those type-line subtasks. Nested subtasks inherit their parent's discipline; an
  untyped one defaults to **Labour**. Claims are entered in the Work Period Allocation modal:
  **Labour in hours, Materials/Sub in %**.
- **Leaf-claim roll-up**: claims live on leaf nodes; a node with children is a pure roll-up of
  them (no double-count). `entryClaimSegments(entry)` is the **single source** for all revenue —
  it returns the category's own bar plus the leaf claims of the subtask tree.
- **CRITICAL INVARIANT (revenue)**: every place that totals gantt revenue MUST go through
  `entryClaimSegments` — never sum `entry.segments` alone. Readers that depend on it: the weekly
  cash-flow strip, the fortnight/INV totals (`plannedByWeek`), the persisted forecast
  (`syncForecast`), the scheduled-accuracy total, and the invoice-cycle anchor (`workStartIso`).
  Every "split category shows $0 / no INV" bug has been a reader that forgot the leaf claims.
  `lib/ganttForecast.test.ts` locks this — extend it when you add a reader.
- **SAME INVARIANT (schedule/dates/cost)**: any reader OUTSIDE the Gantt editor that needs an
  entry's bars, dates or cost MUST go through `entrySegments(entry)` (own bar + split type-line
  leaves), never `entry.segments` alone — a split category clears its own segments, so reading
  them shows nothing. Readers: the Master Programme bars, `projectHealth.getForecastCompletion`
  (-> `scheduleStatus`), the foreman portal week grid, the actuals page. **Categories now default
  to split** (every fresh category is auto-split on load), so this bites EVERY project, not just
  hand-split ones. Same test file locks it.

### Current state (all shipped)
- **Days view default.** Drag-to-reorder categories (grab handle, far left). Long names wrap.
- Mat/Lab/Sub split is the **default** — untouched categories auto-split on load (manual splits,
  schedules and un-splits are left alone); the "Split M/L/S" button re-splits after an un-split.
  Nested subtasks; discipline picker in the modal.
- Weekly cash-flow by source (M / L / S) + week total + yellow **fortnight INV** badge,
  anchored on the 2nd Friday after the first scheduled work, repeating across the horizon
  (Days view: one cell per week, two-column layout; Weeks view: stacked).
- Baselines (timestamped list) with a `#DEEBF7` @ 50% ghost overlay.
- Milestones (in-place or bottom row), optional $ claim value.
- **Print: two buttons** — "Internal PDF" (with a `$` financials toggle) and "Client PDF"
  (high-level: every category collapsed to one solid bar, no financials, no editing controls,
  header subtitle dropped, trimmed to the active date range). Print CSS sets
  `print-color-adjust: exact` and keeps bar cells `position: relative` so bars print.

## Gotchas
- Recurring drift class: a writer (forecast/cash-flow) updated but a parallel reader missed —
  symptom is silent $0 (revenue) or an empty bar/grid (schedule). Check ALL readers go through
  `entryClaimSegments` (revenue) or `entrySegments` (schedule/dates/cost) — never `entry.segments`.
- The page blocks screenshots; don't try to verify visuals yourself — build/test, then ask Chris.
