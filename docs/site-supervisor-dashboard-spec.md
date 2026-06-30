# Site Supervisor / Foreman Dashboard - Build Spec

Status: DRAFT for review (2026-06-30). Not yet built.
Owner: Chris. Author: Claude.

## 1. Summary

A scoped, phone-first area where a site supervisor logs in with a personal passcode and
manages only their own projects, without touching the admin app. It levels up the existing
public foreman portal (`app/foreman/[pin]/page.tsx`) into a logged-in "site cockpit": a list of
their jobs, and per job a focused workspace (this week, schedule, plans, subbies, client and
site details, cost log).

Critically, the schedule the supervisor sets IS our revenue and cost forecast. The gantt is the
forecasting engine (the work periods and allocations drive `entryClaimSegments` -> `plannedByWeek`
-> the fortnightly revenue claims, and the cost phasing). So the supervisor edits the full office
gantt with no financial masking, and their saves must flow back into the same persisted forecast
the office relies on.

## 2. Locked decisions

- Login model: per-supervisor passcode (NOT real Supabase Auth accounts, NOT just a landing page).
- Primary device: phone-first for everything except the gantt edit.
- Schedule editing: the full existing office gantt, no financial masking (costs + GP% visible to
  the supervisor is fine). A "best on landscape/tablet" nudge on the Schedule tab.
- The area lives OUTSIDE the admin LoginGate, like `/foreman` and `/proposal` do today.

## 3. Naming and routing

- New area root: `/site` (the "site cockpit"). Alternatives considered: `/crew`, `/foreman`
  (already taken by the PIN portal). `/site` reads well and is distinct.
- `/site` - login + My Projects.
- `/site/[projectId]` - project workspace (tabs are query/sub-routes; see section 9).
- All `/site/*` routes are added to the public-route bypass in `components/LoginGate.tsx` so the
  admin gate does not intercept them. A separate supervisor session (section 6) gates them instead.
- The existing per-project `/foreman/[pin]` portal stays for now (one-off share links); `/site`
  becomes the primary entry. We can retire `/foreman/[pin]` later once `/site` covers it.

## 4. Architecture overview

Three concerns, each mirroring an existing pattern in the codebase:

1. Auth/session - mirror `lib/serverAuth.ts` (scrypt verify + signed HMAC cookie), but a separate
   `fg_site_session` cookie carrying the supervisor identity.
2. Read access - supervisor-scoped reads of their projects and each project's gantt/actuals/etc.
   Implemented as server API routes using `supabaseAdmin` (service role) after validating the
   session. (We could use SECURITY DEFINER RPCs like the foreman portal, but server routes with
   `supabaseAdmin` are simpler here because the session, not a URL PIN, is the authorisation.)
3. Write access - the load-bearing piece. The supervisor has no Supabase write grant, so every
   write (gantt entries, the derived revenue forecast, weekly actuals) goes through a `/api/site/*`
   route that (a) validates the `fg_site_session`, (b) checks the target project's `foreman`
   matches the session supervisor, then (c) writes via `supabaseAdmin`.

Why server routes + `supabaseAdmin` rather than DEFINER RPCs for the cockpit: the gantt save also
has to persist the forecast (`fg_revenue`) and milestones in one validated, atomic-ish operation,
and the authorisation is a signed session not a PIN. A single server route keeps the service-role
key server-only and keeps the validation in TypeScript next to the rest of the app.

## 5. Data model changes

### 5.1 Supervisor gets a passcode (server-verified)

Current `Supervisor` (`types/index.ts`): `{ id, name, colour, updatedAt? }`. No credential.

Add:
- `passcodeHash?: string` - `scrypt$<hex-salt>$<hex-hash>`, same format as `APP_PASSWORD_HASH`.
  NEVER sent to the client. Stored on the `fg_supervisors` row (new column `passcode_hash TEXT`).
- The plaintext passcode is set by the admin in Settings (SupervisorsSection): admin types a
  passcode, the app POSTs it to a server route that hashes it (scrypt) and stores the hash. The
  admin can reset it the same way. The plaintext is never persisted.

Migration: `ALTER TABLE fg_supervisors ADD COLUMN IF NOT EXISTS passcode_hash TEXT;`

Note: supervisors are linked to projects by `project.foreman === Supervisor.name` (string match).
We keep that for now. If two supervisors could share a name, switch the link to `Supervisor.id`;
out of scope for this build but flagged.

### 5.2 Project gets client contact + site access fields

Current `Project` has only `clientName` and `address` - no phone/email, no site notes.

Add to `Project` (`types/index.ts`) and `fg_projects`:
- `clientPhone?: string`
- `clientEmail?: string`
- `siteAccessNotes?: string` (gate codes, parking, dog on site, where to dump, etc.)

Migrations:
```
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS site_access_notes TEXT;
```
Add the three fields to the admin project edit form (`app/projects/[id]/edit/page.tsx`) and to the
project mappers in `lib/storageAsync.ts`. The proposal already captures `clientEmail`/`clientPhone`
(see `DesignProposal`); where a project came from a proposal we can pre-fill from it.

## 6. Auth and session design

### 6.1 Passcode verification (server-only)

New `lib/siteAuth.ts` (server-only, mirrors `lib/serverAuth.ts`):
- `verifySupervisorPasscode(input: string, passcodeHash: string): boolean` - scrypt + timingSafeEqual,
  identical to `verifyPassword` but takes the hash as an argument (per-supervisor, not a single env).
- `SITE_SESSION_COOKIE = 'fg_site_session'`, 30-day TTL.
- `signSiteSession({ supervisorId, name, exp })` / `verifySiteSession(value)` - same HMAC scheme as
  `serverAuth.ts`, reusing `SESSION_SECRET`. Payload `{ v, sub: supervisorId, name, exp }`.
- `hashPasscode(plain: string): string` - returns `scrypt$salt$hash` for the admin set-passcode flow.

### 6.2 Login flow

- `GET /site` -> if no valid `fg_site_session`, render the login screen; else redirect to My Projects.
- Login screen: a supervisor name picker (dropdown of supervisor names) + a passcode field.
  (Phone-friendly: large tap targets, numeric-friendly passcode input.)
- `POST /api/site/login { supervisorId, passcode }`:
  - load the supervisor row via `supabaseAdmin`, read `passcode_hash`,
  - `verifySupervisorPasscode`; on success set the `fg_site_session` httpOnly cookie and return ok,
  - on failure return 401 (generic message, no per-field leak), with basic rate limiting.
- `POST /api/site/logout` - clears the cookie.

### 6.3 Gating `/site/*`

- Add `/site` to the public-route list in `LoginGate.tsx` (so the admin gate ignores it).
- A small client guard in the `/site` layout calls `GET /api/site/me` (returns `{ supervisorId,
  name }` from the session or 401). If 401, redirect to the `/site` login screen. Mirrors how
  `LoginGate` calls `/api/auth/me`.

## 7. Read access (supervisor-scoped)

New `lib/siteData.ts` (client wrappers) + `/api/site/*` routes (server, `supabaseAdmin`), all
validating `fg_site_session` first:
- `GET /api/site/projects` -> projects where `foreman = session.name` and `status in
  ('planning','active')` (plus pre_start stage). Returns a trimmed card payload (name, address,
  client, dates, a "this week" summary).
- `GET /api/site/projects/[id]` -> the full project IF it belongs to the session supervisor, else 403.
- `GET /api/site/projects/[id]/gantt` -> `fg_gantt` rows for the project (ownership-checked).
- `GET /api/site/projects/[id]/actuals` -> `fg_actuals` rows.
- `GET /api/site/projects/[id]/subbies` -> `SubcontractorPackage`s (incl. `quoteFileData`).
- `GET /api/site/projects/[id]/plans` -> plan image references (Supabase storage paths / IndexedDB
  note; see section 10.3).

Every route does the same two checks: valid session, and `project.foreman === session.name`.

## 8. Write access (the load-bearing piece)

The office gantt persists via `upsertGanttEntries(projectId, entries)` in `lib/storageAsync.ts`,
which writes localStorage AND `supabase.from('fg_gantt').upsert(...)` + deletes removed rows, using
the admin's authenticated client. It also persists the derived forecast to `fg_revenue`
(syncForecast / upsertRevenue). A passcode supervisor has neither an authenticated Supabase session
nor table write grants, so these direct writes fail under the RLS lockdown.

Plan: a "site persistence mode" for the gantt. When the gantt runs inside `/site`, its save calls
route to server endpoints instead of direct Supabase writes:
- `POST /api/site/projects/[id]/gantt { entries, revenueRows, milestones }`:
  - validate session + ownership,
  - replace the project's `fg_gantt` rows (upsert + delete-missing, mirroring `upsertGanttEntries`),
  - replace the project's `fg_revenue` rows (the forecast the office reads),
  - upsert milestones,
  - all via `supabaseAdmin`.
- `POST /api/site/projects/[id]/actual { category, weekEnding, supplyCost, labourCost, notes }` -
  the cost-log write (equivalent to today's `insert_foreman_actual`, but session-scoped).

The forecast rows (`revenueRows`) are computed client-side by the SAME gantt code the office runs
(`plannedByWeek` / `entryClaimSegments`), so the API just persists what the page computed - no
forecast logic is duplicated server-side. This guarantees the office financials and cash-flow update
from the supervisor's edits, because they read `fg_revenue`, which the save now writes.

Implementation approach for the gantt: introduce a persistence adapter (e.g. a `persistMode:
'admin' | 'site'` prop or a small injected save function) so the 2700-line page does not fork. The
gantt computes the same payload either way; only the final write call differs (direct Supabase vs
`/api/site/...`). This is the single most careful change and should land last, after the cockpit and
read paths are proven.

Invariant to honour (from CLAUDE.md): every revenue total must go through `entryClaimSegments`, and
every schedule/cost reader through `entrySegments`. The site save reuses the page's existing
computation, so the invariant holds by construction - but the API must persist the FULL forecast the
page produces (not a subset), or the office will drift.

## 9. Routes and screens (phone-first)

- `/site` (unauthenticated) - login: supervisor picker + passcode.
- `/site` (authenticated) - My Projects: a card per active job. Card shows name, address, client,
  and a "this week" line (categories active this week / next milestone). Big tap targets.
- `/site/[id]` - project workspace, default tab This Week. Tabs (sub-routes or in-page):
  1. This Week (default) - tasks active this week, subbies due, costs to log. The focus screen.
  2. Schedule - the full office gantt (foreman context, editable, saves via section 8). Shows a
     "best viewed in landscape" hint on narrow screens.
  3. Plans - view/download drawings.
  4. Subbies - subcontractor packages: who, contact, amount, download quote PDF.
  5. Client and site - client name/phone/email, site address, access notes. Tap-to-call/email.
  6. Cost Log - weekly supply/labour entry (today's foreman Log tab, session-scoped write).
- A minimal `/site` top bar: project name, back to My Projects, sign out. No admin NavBar.

## 10. Reuse, components, and storage

### 10.1 Reuse from the existing foreman portal
`app/foreman/[pin]/page.tsx` already implements the Schedule week-grid, Budget, and Cost Log against
RPCs. The Cost Log and the week-grid logic port directly into the cockpit (swap PIN-RPC calls for
session-scoped `/api/site` calls).

### 10.2 The gantt
Mount the existing `app/projects/[id]/gantt/page.tsx` gantt under `/site/[id]` Schedule with the
site persistence adapter. No financial masking. Confirm the dense grid is at least usable (scroll)
on a phone; full editing is expected on landscape/tablet.

### 10.3 Files (plans, subbie quotes)
- Subbie quotes are base64 on `SubcontractorPackage.quoteFileData` - downloadable as-is.
- Plan images live in IndexedDB (admin device) and/or Supabase storage buckets. On a supervisor's
  phone there is no admin IndexedDB, so plans must be served from Supabase storage. Confirm plan
  images are reliably uploaded to a bucket today; if not, that upload becomes a small dependency
  (admin-side) before Plans works for supervisors. FLAG: verify the bucket path coverage.

## 11. Security considerations

- Passcode + httpOnly signed session behind a non-guessable area is appropriate for a small trusted
  crew. Sessions are HMAC-signed (forgery needs `SESSION_SECRET`).
- Every read and write re-checks `project.foreman === session.name`. No cross-supervisor access.
- Service-role key stays server-only (API routes), never shipped to the client.
- Passcode hashes are scrypt, never returned to the client.
- Basic rate limiting on `/api/site/login`.
- No audit trail of who changed a bar (that needs real accounts) - acceptable for v1; noted as the
  v3 trigger.

## 12. Phasing and task breakdown

Phase 1 (MVP):
1. Migrations: `passcode_hash` on `fg_supervisors`; `client_phone`/`client_email`/
   `site_access_notes` on `fg_projects`. Update mappers + types.
2. Admin: set/reset supervisor passcode in Settings; add the three project fields to the edit form.
3. `lib/siteAuth.ts` + `/api/site/login` + `/api/site/logout` + `/api/site/me`.
4. `/site` login screen + session guard in `/site` layout (LoginGate bypass).
5. `/api/site/projects` + My Projects screen.
6. `/site/[id]` workspace shell + This Week + Client and site + Cost Log + Subbies + Plans (reads).
7. Schedule tab: mount the gantt with the site persistence adapter; `/api/site/.../gantt` write
   (gantt + forecast + milestones). LAND LAST.

Phase 2: site diary + progress photos; schedule-change notification to the office; read-only Scope
(estimate) view.

Phase 3: optional upgrade to real per-user Supabase Auth accounts + audit, only if passcodes are
outgrown. Data scoping is unchanged, so no rework.

## 13. Open questions / risks

- Plans on a phone depend on Supabase-storage coverage of plan images (section 10.3) - verify.
- The gantt on a phone: confirm "view on phone, edit on landscape" is acceptable, or whether a
  later simplified mobile schedule editor is wanted (currently out of scope).
- Supervisor-name vs id linkage (section 5.1) - fine while names are unique.
- Do we want the office to be notified when a supervisor changes a schedule (forecast moved)?
  Proposed for Phase 2.

## 14. Out of scope (this build)

- Real per-user accounts, password reset, audit log (Phase 3).
- A bespoke mobile-only schedule editor (we reuse the office gantt).
- Client-facing status sharing.
- Document management UI beyond view/download of existing plans and subbie quotes.
