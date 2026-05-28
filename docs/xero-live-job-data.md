# Xero Live Job Data — Design Doc

**Author:** Claude (Sonnet 4.7 1M)
**Status:** Draft for review
**Last updated:** 2026-05-28
**Replaces:** `Live_Jobs_Tracker__Andrew_.xlsx`, the cost half of the per-job Westcott-style spreadsheets

---

## 1. Goal in one sentence

Show the live forecast GP % per active job — pulled from Xero costs tagged by tracking category, snapshotted monthly for historical comparison — so the weekly portfolio review (the Live_Jobs_Tracker file) is done in the platform rather than by hand.

## 2. Scope

### In scope
- Pull cost-to-date per project from Xero (Bills + Spend Money + Manual Journals) filtered by Xero Tracking Category
- Project ↔ Xero Tracking Category mapping (1:1 per project)
- Dashboard table matching the Live_Jobs_Tracker Summary columns
- Per-project drilldown showing cost by Xero account
- Per-account "forecast final cost" override (the manual reforecast column on Andrew's job tabs)
- Hourly background refresh + manual "Refresh now" button + last-sync timestamp
- Monthly auto-snapshot on the last day of the month so historical forecasts are preserved
- Labour reconciliation: foreman hours = leading indicator, Xero payroll = source of truth

### Out of scope (deliberately)
- Full per-job P&L below the GP line (overheads, director costs, net profit) — Xero already does this natively; we add a deep-link to the Xero report instead
- Whole-company P&L (`Overheads` sheet) — accountant's territory
- The historical 19-job WIP/margin calculator (`Margin & WIP Calculator`) — useful for quarterly fade tracking but better lives with the accountant until the platform has enough history of its own
- Per-week cost breakdowns in the live view (the Westcott `LIVE COST` and `BUDGETED COST` sheets) — those reduce to a single "actual vs budget" line at the GP level once Xero is the source of truth
- Modifying Xero data — read-only integration only

## 3. Decisions baked in

| Decision | Chosen |
|---|---|
| Xero cost attribution | **Tracking Categories** (project-as-tracking-value) |
| Labour cost authority | **Xero payroll = truth; foreman hours = leading indicator** with drift surfaced |
| Snapshot history | **Auto-snapshot on month-end** (plus manual "Snapshot now" button) |
| GP-only? | **Yes** — overheads/net profit explicitly out of scope |
| Xero Tracking Category name | **"Project"** |
| Labour cost-of-sales accounts | **`Wages & Salaries - Production`** and **`Superannuation - Production`** only. Workcover and other on-costs are deliberately excluded (Chris allocates them centrally, not per-project) |
| Target margin | **Per-project** — each project has its own `targetMarginPct`. Status thresholds (`on_target` / `watch` / `below_target`) compare against the project's own target, not a global 40% |
| Project lifecycle | **Live dashboard shows projects with `status != 'complete'`**. Snapshots keep accumulating for completed projects (for fade tracking) but they drop off the operational view |
| First-sync strategy | **Rip the bandage off** — pull all 24 months of historical bills in one go, no preview UI. Progress shown via the sync-status header strip |
| Per-week revenue+cost view | **Drop it** (see §5.1 "What we're not building" — the live cost-to-date number replaces the workaround) |

### Hard guardrail: GP only, never NP

Andrew (and now the platform) never surface anything below the GP line. This means:

- **Cost-of-sales accounts only** are pulled from Xero. Operating expenses, director comp, overheads, depreciation, interest, tax — **never queried, never displayed, never stored**.
- The cost-account allowlist is defined by Xero's chart of accounts where `Class = REVENUE` or `Class = DIRECTCOSTS` (Xero's term for COGS). Anything in `EXPENSE` class is excluded at the puller level — defensive: even if a bill is mis-coded to an operating expense, it can't accidentally leak into the project view.
- "Forecast GP" and "GP %" are the headline metrics. Net profit is not a concept anywhere in the platform UI.
- The "Open in Xero" deep link takes users to Xero's Budget Variance report scoped to GP. If they want NP they navigate up in Xero — not in this app.

This guardrail is enforceable in code (the puller filters on account class) and surfaced as a comment in the schema so future changes don't break it.

## 4. Data model

### Change to `fg_projects` (existing table)

```sql
-- Per-project target GP %. Replaces the previous global 40% assumption.
-- NULL = use the legacy 40% default so existing projects work unchanged.
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS target_margin_pct NUMERIC;
```

Mirrored on the `Project` TypeScript type as `targetMarginPct?: number`.

### New Supabase tables

```sql
-- Mapping from internal project to Xero tracking category value
CREATE TABLE fg_project_xero_mapping (
  project_id        TEXT PRIMARY KEY REFERENCES fg_projects(id),
  tracking_category_id  TEXT NOT NULL,   -- Xero tracking category UUID (one per org)
  tracking_option_id    TEXT NOT NULL,   -- Xero tracking option UUID for THIS project
  tracking_option_name  TEXT NOT NULL,   -- denormalised display name ("Clifton St")
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Cached cost rows pulled from Xero, aggregated to project + account
CREATE TABLE fg_xero_project_costs (
  id                BIGSERIAL PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES fg_projects(id),
  account_code      TEXT NOT NULL,       -- Xero account code, e.g. "311" for Subcontractors
  account_name      TEXT NOT NULL,       -- denormalised ("Subcontractors")
  amount_ex_gst     NUMERIC NOT NULL,    -- cumulative spend on this account for this project
  bill_count        INTEGER NOT NULL,    -- so the UI can show "based on 14 bills"
  last_bill_date    DATE,                -- most recent transaction date in the rollup
  pulled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, account_code)
);

-- Manual forecast override per account per project (the "Forecast final" column)
CREATE TABLE fg_project_cost_forecast (
  project_id        TEXT NOT NULL REFERENCES fg_projects(id),
  account_code      TEXT NOT NULL,
  forecast_final    NUMERIC,             -- NULL = use the budget (or actual, whichever higher)
  comment           TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, account_code)
);

-- Monthly snapshot of every active project's full forecast row.
-- One snapshot row per project per month-end. Append-only.
CREATE TABLE fg_project_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES fg_projects(id),
  snapshot_date     DATE NOT NULL,       -- always end-of-month
  forecast_revenue  NUMERIC NOT NULL,
  invoiced_to_date  NUMERIC NOT NULL,
  cost_to_date      NUMERIC NOT NULL,
  forecast_final_cost NUMERIC NOT NULL,
  forecast_gp_dollars NUMERIC NOT NULL,
  forecast_gp_pct   NUMERIC NOT NULL,
  quoted_margin_pct NUMERIC,
  status            TEXT NOT NULL,       -- 'on_target' | 'watch' | 'below_target'
  cost_by_account   JSONB NOT NULL,      -- frozen copy of {account_code: amount} at snapshot time
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, snapshot_date)
);

-- Pull-run log so we can see when refreshes ran and what they found
CREATE TABLE fg_xero_pull_runs (
  id                BIGSERIAL PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  trigger           TEXT NOT NULL,       -- 'cron_hourly' | 'manual' | 'cron_month_end'
  status            TEXT NOT NULL,       -- 'running' | 'ok' | 'error'
  bills_processed   INTEGER,
  projects_updated  INTEGER,
  error_message     TEXT
);
```

All four tables are **service-role-only** (no anon access). Reads from the client go via authenticated user, scoped by the existing `authenticated` RLS policy pattern.

## 5.1 What we're not building (and why)

### The per-week revenue + cost matrix (Westcott `LIVE COST`, `BUDGETED COST`, `LIVE REVENUE`, `PLANNED REVENUE` sheets)

These sheets were a workaround for not having a live Xero feed — they let Andrew walk through "what was spent in week 13, week 14, …" by category, then compare to the per-week budget.

Once Xero is the source of truth for cost-to-date, the per-week breakdown becomes a transient view: "show me bills posted between date X and Y, grouped by week, for this project" — that's a query against `fg_xero_project_costs` joined to the raw bill dates. We can build it as a Phase 6 drilldown if you miss it, but my read is:

- **For GP tracking**: cost-to-date + forecast-final-cost gives you the GP. Week-by-week adds no signal.
- **For cashflow planning**: the existing Revenue calendar (planned revenue per week) is the right home for that. We could add planned-cost-per-week derived from gantt segments — but that's a separate cashflow view, not the GP dashboard.
- **For "I want to know when this cost showed up"**: per-account drilldown → click an account → see the underlying Xero bills with dates. One extra layer of click, but lives at the right level of detail.

**Recommendation**: don't rebuild the per-week matrix. If after Phase 3 you genuinely miss it, we add the drilldown then. Most likely you won't — it was a side effect of manual tracking, not the actual signal you cared about.

### The Westcott `COST & LABOUR DASHBOARD` sheet (labour hours allowance / hours used / rate)

This is real operational signal — but it splits into two pieces that live in different places now:

- **Labour cost tracking** → handled by the new live Xero feed + foreman page reconciliation (Phase 5)
- **Hours allowance / hours used / weeks left at current rate** → this is genuine site management data. Suggest: a small "Labour pace" panel on the Costs tab showing `allowance hours · used to date · burn rate · weeks left at current pace`. Half-day add to Phase 5 if you want it.

## 5. Xero API specifics

### Tracking Categories
- One-time setup: `GET /TrackingCategories` to discover the category ("Projects" or similar) and its options.
- The mapping UI lets the user pick the tracking option for each project from a dropdown.
- We persist `tracking_category_id` + `tracking_option_id` (UUIDs) not just names, so a rename in Xero doesn't break the link.

### Cost pull
- **Endpoint:** `GET /Invoices?where=Type=="ACCPAY"&order=Date DESC` (Bills, accounts payable)
- **Also:** `GET /BankTransactions?where=Type=="SPEND"` (Spend Money / direct debits)
- **Also:** Manual journals where the credit side is a P&L account. Skip on v1 if rare in Chris's data.
- **Filter:** in-memory after fetch — Xero's `where` clause doesn't filter on `Tracking[].TrackingOptionID` server-side. We pull all recent invoices, then filter line items by tracking option.
- **Pagination:** Xero returns 100 invoices per page. We paginate via `?page=N` until empty.
- **Time window:** v1 pulls the trailing 24 months. Older spend rarely matters and limits API calls.

### Rate limits
- Xero: 60 calls / minute, 5000 / day per app per tenant.
- Hourly cron with ~20 paginated calls = 480/day. Comfortable headroom.
- Manual refresh debounced to 1/minute per project (no spam).

### Caching
- `fg_xero_project_costs` is the cache. UI never hits Xero directly.
- Cron refresh writes to cache, then notifies (via the cross-tab BroadcastChannel already shipped) so open dashboards re-render.
- Cache TTL is implicit: every hour by default; per-project "Refresh now" updates that project's rows immediately.

## 6. Calculations

### Per-project, on the dashboard

```
costToDate          = SUM(fg_xero_project_costs.amount_ex_gst WHERE project_id = X)
forecastFinalCost   = SUM(
                       fg_project_cost_forecast.forecast_final IF SET,
                       ELSE MAX(account.actual, account.budget)
                     ) per account
forecastRevenue     = effectiveContract (already computed — revisedContract OR contractValue)
forecastGPDollars   = forecastRevenue - forecastFinalCost
forecastGPPercent   = forecastGPDollars / forecastRevenue × 100
quotedMarginPct     = baseline.gpPercent  (already stored)
fadePpts            = forecastGPPercent - quotedMarginPct
status              = if forecastGPPercent >= 38: 'on_target'
                      else if forecastGPPercent >= 30: 'watch'
                      else: 'below_target'
```

Status thresholds match Andrew's spreadsheet rule.

### Labour reconciliation

Two lines shown on the per-project view:

```
Labour (Xero)       = SUM(costs where account = "Wages & Salaries - Production")
Labour (foreman)    = SUM(WeeklyActuals.labourCost where project = X)
Drift               = Labour (Xero) - Labour (foreman)
```

- **Drift > 5% in either direction**: amber chip, "Reconcile" link
- **Lag indicator**: if `Labour (foreman).max(weekEnding) > Labour (Xero).max(pulled_at) - 14 days`, flag "Payroll lag — Xero may be behind"
- The forecast uses **Xero** for past weeks where payroll has posted, **foreman estimate** for the current week.

### Month-end snapshot

- Cron at 23:59 on the last day of each month (local time AEST)
- For every project where `status = 'active'`:
  - Compute the same row the dashboard shows
  - Insert into `fg_project_snapshots` with that month's last-day date
- Snapshots are append-only. If the cron runs twice for the same month-end, the unique constraint blocks the dupe.
- A "Snapshot now" button on the dashboard lets the user trigger one manually (e.g. for a board pack mid-month).

## 7. UI

### Dashboard — new "Live Jobs" section

Replaces / sits next to the existing "Division Performance" tiles. Matches Andrew's `Summary` sheet column-for-column:

| Job | Forecast revenue | Invoiced | % billed | Cost to date | Forecast final cost | Forecast GP $ | Forecast GP % | Quote | Fade | Status |
|---|---|---|---|---|---|---|---|---|---|---|

- Row click → project Position tab (existing route)
- Header strip: "Last Xero sync: 14 min ago · Refresh now"
- Per-row dot: green / amber / red on Status
- "2 jobs below target" pill (matches the existing Andrew layout)

### Project page — new "Costs" tab

Sits between the existing "Position" and "Operations" tabs. Mirrors Andrew's per-job tabs (Beach Rd, Serpells, etc):

```
Headline: Forecast revenue · Invoiced to date · % billed · Cost to date · Forecast GP · Forecast GP %

Revenue & Cost Detail
─────────────────────────────────────────────────────────────────────
Account                          Spent       Budget    Forecast   vs Budget   Comments
Concrete                         $2,839      $9,298    $9,298     —
Construction & Hardware Costs    $27,833     $48,000   $50,000    $2,000      [editable comment]
Equipment Rental Expense         $1,709      $1,100    $1,708     $608
…
Subcontractors                   $52,353     $208,000  $200,000   ($8,000)
Wages & Salaries — Production    $58,565     $165,000  $168,000   $3,000
  └ Foreman entries this period: $61,200 · drift +$2,635 [Reconcile]
…
Total Cost of Sales              $180,322    $527,405  $565,532   $38,127
GROSS PROFIT                     $74,678     $328,360  $290,233
Gross profit %                   29.3%       38.4%     33.9%

Target margin 40%  ·  Original quote 40%  ·  STATUS: Watch
```

- Forecast column is editable per row → writes `fg_project_cost_forecast.forecast_final`
- Comments column is editable per row → writes `fg_project_cost_forecast.comment`
- Footer: "Open in Xero" deep link to the project's Budget Variance report
- "Last synced: …" + per-project refresh button

### Settings — new "Xero mapping" section

After Xero is connected (the existing flow already shipped), a new section:

```
PROJECT ↔ XERO TRACKING

Tracking Category:  [ Projects                  ▼ ]   (from Xero)

Project                Mapped to                    Status
Clifton                Clifton St          ▼        ✓ Mapped
Beach Rd               Beach Rd            ▼        ✓ Mapped
Serpells               (unmapped)          ▼        ⚠ No costs will appear
…

[ Pull now ]   Last pull: 14 min ago · 47 bills processed
```

Unmapped projects show a warning on their Position tab too.

### Snapshots view

New `/snapshots` page (also reachable from each project page). Shows a table of every month-end snapshot per project, plus a "fade chart" — forecast GP % over time per project. This is the future-proofing piece: in 6 months you'll be able to see "Beach Rd was forecast 38% in Jan, 35% in Feb, 33% in March — fade trend".

v1 ships the snapshot table; the chart is a stretch.

## 8. Server architecture

### New routes

```
POST  /api/xero/sync-now              → trigger pull (manual, debounced 1/min/user)
GET   /api/xero/tracking-categories   → list categories + options (already exists, lift cache)
GET   /api/xero/sync-status           → { last_run, bills_processed, status }
GET   /api/projects/:id/costs         → cached cost rows + forecast overrides
POST  /api/projects/:id/costs/:account/forecast  → write override
GET   /api/snapshots                  → list all snapshots (all projects)
POST  /api/snapshots/now              → trigger month-end-style snapshot right now
```

### Cron / background work

Vercel cron (free tier supports daily; hourly needs Pro). Two options:

1. **Vercel Cron** (paid tier): `vercel.json` with `{ "crons": [{ "path": "/api/xero/cron-pull", "schedule": "0 * * * *" }] }`. Hourly trigger.
2. **External scheduler** (free): GitHub Action on schedule, calls a webhook on the app.

We already have `scheduled-tasks` MCP on Chris's machine for personal use, but production needs Vercel-side or GitHub Action. Suggest GitHub Action for v1 — zero extra cost, easy to inspect.

Month-end cron: `0 14 28-31 * *` (run at 14:00 UTC = 00:00 AEST on the last few days of the month; the route checks "is today actually the last day of the month?" before snapshotting).

## 9. Migration / rollout

### Phase 1 — Foundation (~2 sessions)
- Schema (the four tables above)
- Project↔Xero mapping UI in settings
- Initial cost puller (no cron, manual "Pull now" only)
- Cache write to `fg_xero_project_costs`
- Basic "Cost to date" surfaced on existing Position tab (one number, no breakdown yet)

### Phase 2 — Dashboard view (~1 session)
- New "Live Jobs" table on dashboard matching Live_Jobs_Tracker Summary columns
- Status thresholds + fade calculation
- "Last synced" header strip

### Phase 3 — Project costs tab (~1 session)
- Per-account breakdown view
- Forecast override editing
- Comments editing
- "Open in Xero" deep link

### Phase 4 — Snapshots + cron (~0.5 session)
- Snapshot schema + write logic
- GitHub Action for hourly pull
- Month-end snapshot logic
- Snapshots history table

### Phase 5 — Labour reconciliation (~0.5 session)
- Drift calculation
- Payroll-lag warning
- "Reconcile" UX (manual override or accept-Xero button)

**Total: ~5 focused sessions**, ship-ready at each phase boundary. Retire spreadsheets after Phase 3 (Live_Jobs_Tracker and Westcott cost sheets); keep using Xero directly for the GP ACTUAL / full P&L view.

## 10. Decisions confirmed (2026-05-28)

All six open questions resolved by Chris:

1. **Tracking Category name**: `Project`
2. **Production labour accounts**: `Wages & Salaries - Production`, `Superannuation - Production`. **Workcover excluded** — allocated centrally, not per-project
3. **Target margins**: per-project. `targetMarginPct` added to `fg_projects` schema and `Project` TS type. Default fallback 40% for legacy rows
4. **Project lifecycle**: live dashboard shows `status != 'complete'`. Completed projects continue to accumulate snapshots for fade tracking but drop off operational view
5. **Per-week view**: don't rebuild (see §5.1). Drill into cost-by-account → underlying bills if needed
6. **First sync**: rip the bandage off — full 24 months of bills in one go, no preview UI. Progress shown in sync-status header strip

**Plus a hard rule (§3)**: never surface NP. Cost-of-sales accounts only. The puller enforces this at the API layer by filtering on Xero account class.

## 11. What I'd hand to Andrew

Andrew currently maintains the Live_Jobs_Tracker weekly by reading Xero exports. Post-launch, his workflow becomes:

- **Old**: open Xero → run Budget Variance report per project → paste into job tab → recompute Summary
- **New**: open the platform → check the Live Jobs table → drill into anything that looks off → if a forecast override is needed, edit in the Costs tab → snapshots happen automatically

He keeps the `Individual job reports.xlsx` for monthly close (full P&L, overheads, WIP across all 19+ historical jobs) — that's accountant work and the platform doesn't replicate it.

## 12. Risks I want to call out

| Risk | Mitigation |
|---|---|
| Xero costs land in the wrong tracking option (mis-tagged bill) | Per-account drilldown shows the source bills; click-through to Xero to fix. We don't try to validate Xero's data, just surface it |
| Bills posted late (e.g. supplier sends invoice in May for April work) | Cost-to-date includes the late bill at the date it was posted to Xero, not the work date. Acceptable for GP tracking; flag in the snapshot history if a prior month's costs grow |
| Foreman labour drift becomes noise | Drift threshold is configurable (default ±5%); below threshold doesn't flag |
| Snapshot history grows fast | One row per project per month. 20 active projects × 60 months = 1200 rows. Trivial |
| Cron failure goes unnoticed | `fg_xero_pull_runs` table surfaces last-run status. Dashboard header strip turns amber if last successful sync > 2h ago |
| Xero rate limit hit during initial backfill | First sync runs in chunks of 100 invoices with 1.1s gap. Estimate: ~30s for 12 months of data |
